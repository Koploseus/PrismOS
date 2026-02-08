/**
 * GET /api/position/:address
 *
 * Wallet balances + LP position data via Zerion API (primary)
 * with RPC fallback for wallet balances.
 */

import { Context } from "hono";
import { createPublicClient, http, formatUnits, isAddress, type Address } from "viem";
import { generateReceipt } from "../middleware/x402.js";
import { fetchTokenPrices } from "../lib/positionChecker.js";
import { resolveAgentENS, resolveStrategyConfig } from "../lib/ens.js";
import { CHAIN_CONFIGS } from "../../../../packages/shared/src/constants.js";
import * as zerion from "../lib/zerion.js";

const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// ---------------------------------------------------------------------------
// Zerion-based position reading
// ---------------------------------------------------------------------------

interface ZerionPositionSummary {
  walletPositions: Array<{ symbol: string; amount: number; valueUsd: number; priceUsd: number }>;
  lpGroups: Array<{
    groupId: string;
    protocol: string;
    positions: Array<{ symbol: string; amount: number; valueUsd: number; priceUsd: number }>;
    totalValueUsd: number;
  }>;
  totalWalletUsd: number;
  totalLpUsd: number;
  totalUsd: number;
}

async function readPositionsFromZerion(
  address: string,
  chainId: number,
  token0Symbol: string,
  token1Symbol: string
): Promise<ZerionPositionSummary | null> {
  const zerionChain = zerion.CHAIN_ID_TO_ZERION[chainId];
  if (!zerionChain) {
    console.warn(`[position] No Zerion chain mapping for chainId ${chainId}`);
    return null;
  }

  const positionsResp = await zerion.getPositions(address, {
    filter: "no_filter",
    chainId: zerionChain,
  });

  if (!positionsResp?.data?.length) {
    console.log("[position] Zerion returned no positions");
    return null;
  }

  // Separate wallet vs DeFi positions
  const walletPositions: ZerionPositionSummary["walletPositions"] = [];
  const defiPositions: zerion.ZerionPosition[] = [];

  for (const pos of positionsResp.data) {
    const attrs = pos.attributes;
    if (attrs.position_type === "wallet") {
      walletPositions.push({
        symbol: attrs.fungible_info.symbol,
        amount: attrs.quantity.float,
        valueUsd: attrs.value ?? 0,
        priceUsd: attrs.price,
      });
    } else if (attrs.position_type === "deposit" || attrs.position_type === "reward") {
      defiPositions.push(pos);
    }
  }

  // Group DeFi positions by group_id
  const groups = new Map<string, zerion.ZerionPosition[]>();
  for (const pos of defiPositions) {
    const gid = pos.attributes.group_id || pos.id;
    const arr = groups.get(gid) || [];
    arr.push(pos);
    groups.set(gid, arr);
  }

  const lpGroups: ZerionPositionSummary["lpGroups"] = [];
  for (const [groupId, groupPositions] of groups) {
    const protocol = groupPositions[0]?.attributes.protocol || "Unknown";
    const positions = groupPositions.map((p) => ({
      symbol: p.attributes.fungible_info.symbol,
      amount: p.attributes.quantity.float,
      valueUsd: p.attributes.value ?? 0,
      priceUsd: p.attributes.price,
    }));
    lpGroups.push({
      groupId,
      protocol,
      positions,
      totalValueUsd: positions.reduce((s, p) => s + p.valueUsd, 0),
    });
  }

  const totalWalletUsd = walletPositions.reduce((s, p) => s + p.valueUsd, 0);
  const totalLpUsd = lpGroups.reduce((s, g) => s + g.totalValueUsd, 0);

  console.log(
    `[position] Zerion: wallet=$${totalWalletUsd.toFixed(2)}, lp=$${totalLpUsd.toFixed(2)}, ` +
      `groups=${lpGroups.length}, walletTokens=${walletPositions.length}`
  );

  return {
    walletPositions,
    lpGroups,
    totalWalletUsd,
    totalLpUsd,
    totalUsd: totalWalletUsd + totalLpUsd,
  };
}

// ---------------------------------------------------------------------------
// RPC fallback for wallet balances
// ---------------------------------------------------------------------------

async function readWalletBalancesRPC(
  address: string,
  strategy: ReturnType<typeof resolveStrategyConfig> & object
) {
  const chainConfig = CHAIN_CONFIGS[strategy.chainId];
  const client = createPublicClient({
    transport: http(chainConfig?.rpcUrl || "https://ethereum-rpc.publicnode.com"),
  });

  const [token0Balance, token1Balance, prices] = await Promise.all([
    client.readContract({
      address: strategy.token0 as Address,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [address as Address],
    }),
    client.readContract({
      address: strategy.token1 as Address,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [address as Address],
    }),
    fetchTokenPrices(
      strategy.token0Symbol,
      strategy.token1Symbol,
      strategy.token0,
      strategy.token1
    ),
  ]);

  const token0Amount = Number(formatUnits(token0Balance, strategy.token0Decimals));
  const token1Amount = Number(formatUnits(token1Balance, strategy.token1Decimals));

  return {
    token0Balance: token0Balance.toString(),
    token1Balance: token1Balance.toString(),
    token0Amount,
    token1Amount,
    walletToken0Usd: token0Amount * prices.token0PriceUsd,
    walletToken1Usd: token1Amount * prices.token1PriceUsd,
    walletValueUsd: token0Amount * prices.token0PriceUsd + token1Amount * prices.token1PriceUsd,
    token0PriceUsd: prices.token0PriceUsd,
    token1PriceUsd: prices.token1PriceUsd,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRecommendations(hasLP: boolean, walletValue: number, lpValue: number): string[] {
  const recs: string[] = [];
  if (!hasLP && walletValue > 1) recs.push("Create LP position to start earning fees");
  if (hasLP && walletValue > 1) recs.push("Add remaining funds to LP position");
  if (hasLP) recs.push("Position actively earning fees");
  if (lpValue > 0) recs.push(`LP position value: $${lpValue.toFixed(2)}`);
  if (walletValue < 1 && !hasLP) recs.push("Deposit funds to get started");
  return recs.length ? recs : ["Account ready"];
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function positionHandler(c: Context): Promise<Response> {
  try {
    const address = c.req.param("address");
    const agentEns = c.req.query("agent") || c.req.query("agentEns");

    if (!address || !isAddress(address)) {
      return c.json({ success: false, error: "Invalid address", code: "INVALID_ADDRESS" }, 400);
    }
    if (!agentEns) {
      return c.json(
        { success: false, error: "agent query param required", code: "MISSING_AGENT" },
        400
      );
    }

    const ensConfig = await resolveAgentENS(agentEns);
    const strategy = resolveStrategyConfig(ensConfig);
    if (!strategy) {
      return c.json(
        { success: false, error: "Could not resolve strategy", code: "INVALID_STRATEGY" },
        400
      );
    }

    // ----- Try Zerion first -----
    const zerionData = await readPositionsFromZerion(
      address,
      strategy.chainId,
      strategy.token0Symbol,
      strategy.token1Symbol
    );

    if (zerionData) {
      // Find the LP group that matches our strategy tokens
      const matchingLp = zerionData.lpGroups.find((g) => {
        const symbols = g.positions.map((p) => p.symbol.toUpperCase());
        return (
          symbols.includes(strategy.token0Symbol.toUpperCase()) &&
          symbols.includes(strategy.token1Symbol.toUpperCase())
        );
      });

      // Find wallet balances for our tokens
      const walletToken0 = zerionData.walletPositions.find(
        (p) => p.symbol.toUpperCase() === strategy.token0Symbol.toUpperCase()
      );
      const walletToken1 = zerionData.walletPositions.find(
        (p) => p.symbol.toUpperCase() === strategy.token1Symbol.toUpperCase()
      );

      const lpToken0 = matchingLp?.positions.find(
        (p) => p.symbol.toUpperCase() === strategy.token0Symbol.toUpperCase()
      );
      const lpToken1 = matchingLp?.positions.find(
        (p) => p.symbol.toUpperCase() === strategy.token1Symbol.toUpperCase()
      );

      const walletUsd = (walletToken0?.valueUsd ?? 0) + (walletToken1?.valueUsd ?? 0);
      const lpUsd = matchingLp?.totalValueUsd ?? 0;
      const totalUsd = walletUsd + lpUsd;
      const hasPosition = !!matchingLp && lpUsd > 0;

      const token0PriceUsd = walletToken0?.priceUsd ?? lpToken0?.priceUsd ?? 0;
      const token1PriceUsd = walletToken1?.priceUsd ?? lpToken1?.priceUsd ?? 0;

      const totalToken0Usd = (walletToken0?.valueUsd ?? 0) + (lpToken0?.valueUsd ?? 0);
      const totalToken1Usd = (walletToken1?.valueUsd ?? 0) + (lpToken1?.valueUsd ?? 0);
      const totalAll = totalToken0Usd + totalToken1Usd;
      const token0Ratio = totalAll > 0 ? totalToken0Usd / totalAll : 0.5;

      return c.json({
        success: true,
        address,
        chainId: strategy.chainId,
        hasPosition,
        walletValueUsd: totalUsd,
        token0Balance: "0", // raw not available from Zerion
        token1Balance: "0",
        token0Address: strategy.token0,
        token1Address: strategy.token1,
        token0Decimals: strategy.token0Decimals,
        token1Decimals: strategy.token1Decimals,
        token0Symbol: strategy.token0Symbol,
        token1Symbol: strategy.token1Symbol,
        positionCount: hasPosition ? 1 : 0,
        token0PriceUsd,
        token1PriceUsd,

        strategy: {
          chainId: strategy.chainId,
          protocol: strategy.protocol,
          pool: strategy.pool,
          token0: {
            address: strategy.token0,
            symbol: strategy.token0Symbol,
            decimals: strategy.token0Decimals,
          },
          token1: {
            address: strategy.token1,
            symbol: strategy.token1Symbol,
            decimals: strategy.token1Decimals,
          },
        },

        wallet: {
          token0: {
            raw: "0",
            formatted: (walletToken0?.amount ?? 0).toFixed(strategy.token0Decimals),
            usd: (walletToken0?.valueUsd ?? 0).toFixed(2),
          },
          token1: {
            raw: "0",
            formatted: (walletToken1?.amount ?? 0).toFixed(strategy.token1Decimals),
            usd: (walletToken1?.valueUsd ?? 0).toFixed(2),
          },
          totalValueUsd: walletUsd.toFixed(2),
        },

        lpPositions: {
          count: hasPosition ? 1 : 0,
          positionManager: strategy.positionManager,
          tokenIds: [],
          pool: `${strategy.token0Symbol}/${strategy.token1Symbol}`,
          protocol: matchingLp?.protocol || strategy.protocol,
          ...(hasPosition &&
            matchingLp && {
              valueUsd: lpUsd,
              inRange: true, // Zerion doesn't give tick data; if position has value, it's active
              token0Amount: lpToken0?.amount ?? 0,
              token1Amount: lpToken1?.amount ?? 0,
            }),
        },

        summary: {
          walletValueUsd: totalUsd.toFixed(2),
          positionCount: hasPosition ? 1 : 0,
          token0Ratio: `${(token0Ratio * 100).toFixed(1)}%`,
          hasActivePosition: hasPosition,
          inRange: hasPosition,
        },

        market: {
          token0PriceUsd: token0PriceUsd.toFixed(2),
          token1PriceUsd: token1PriceUsd.toFixed(2),
          timestamp: Date.now(),
        },

        recommendations: getRecommendations(hasPosition, walletUsd, lpUsd),
        dataSource: "zerion",

        receipt: generateReceipt(c.get("paymentId"), "/api/position", 0.005, [
          "balances",
          "lpPositions",
          "analytics",
        ]),
      });
    }

    // ----- RPC Fallback -----
    console.log("[position] Zerion unavailable, falling back to RPC");
    const rpc = await readWalletBalancesRPC(address, strategy);

    return c.json({
      success: true,
      address,
      chainId: strategy.chainId,
      hasPosition: false,
      walletValueUsd: rpc.walletValueUsd,
      token0Balance: rpc.token0Balance,
      token1Balance: rpc.token1Balance,
      token0Address: strategy.token0,
      token1Address: strategy.token1,
      token0Decimals: strategy.token0Decimals,
      token1Decimals: strategy.token1Decimals,
      token0Symbol: strategy.token0Symbol,
      token1Symbol: strategy.token1Symbol,
      positionCount: 0,
      token0PriceUsd: rpc.token0PriceUsd,
      token1PriceUsd: rpc.token1PriceUsd,

      strategy: {
        chainId: strategy.chainId,
        protocol: strategy.protocol,
        pool: strategy.pool,
        token0: {
          address: strategy.token0,
          symbol: strategy.token0Symbol,
          decimals: strategy.token0Decimals,
        },
        token1: {
          address: strategy.token1,
          symbol: strategy.token1Symbol,
          decimals: strategy.token1Decimals,
        },
      },

      wallet: {
        token0: {
          raw: rpc.token0Balance,
          formatted: rpc.token0Amount.toFixed(strategy.token0Decimals),
          usd: rpc.walletToken0Usd.toFixed(2),
        },
        token1: {
          raw: rpc.token1Balance,
          formatted: rpc.token1Amount.toFixed(strategy.token1Decimals),
          usd: rpc.walletToken1Usd.toFixed(2),
        },
        totalValueUsd: rpc.walletValueUsd.toFixed(2),
      },

      lpPositions: {
        count: 0,
        positionManager: strategy.positionManager,
        tokenIds: [],
        pool: `${strategy.token0Symbol}/${strategy.token1Symbol}`,
        protocol: strategy.protocol,
      },

      summary: {
        walletValueUsd: rpc.walletValueUsd.toFixed(2),
        positionCount: 0,
        token0Ratio: "50.0%",
        hasActivePosition: false,
        inRange: false,
      },

      market: {
        token0PriceUsd: rpc.token0PriceUsd.toFixed(2),
        token1PriceUsd: rpc.token1PriceUsd.toFixed(2),
        timestamp: Date.now(),
      },

      recommendations: getRecommendations(false, rpc.walletValueUsd, 0),
      dataSource: "rpc",

      receipt: generateReceipt(c.get("paymentId"), "/api/position", 0.005, [
        "balances",
        "lpPositions",
        "analytics",
      ]),
    });
  } catch (error: unknown) {
    console.error("[position]", error);
    return c.json({ success: false, error: "Internal error", code: "INTERNAL_ERROR" }, 500);
  }
}
