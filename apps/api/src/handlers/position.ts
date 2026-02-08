/**
 * GET /api/position/:address
 *
 * Wallet balances + LP positions using ENS strategy config.
 */

import { Context } from "hono";
import { formatUnits, isAddress } from "viem";
import { generateReceipt } from "../middleware/x402";
import {
  createChainClient,
  fetchBalance,
  fetchNFTBalance,
  fetchBTCPrice,
} from "../lib/positionChecker";
import { resolveAgentENS, resolveStrategyConfig } from "../lib/ens";
import * as fs from "fs";
import * as path from "path";

function getSubscriptionData(
  address: string
): { positionTokenId?: string; positionTxHash?: string } | null {
  try {
    const subPath = path.resolve(__dirname, "../../../../data/subscriptions.json");
    if (fs.existsSync(subPath)) {
      const data = JSON.parse(fs.readFileSync(subPath, "utf-8"));
      const key = address.toLowerCase();
      return data.subscriptions?.[key] || null;
    }
  } catch {
    // Ignore invalid file state
  }
  return null;
}

function getRecommendations(positionCount: number, walletValue: number): string[] {
  const recs: string[] = [];
  if (positionCount === 0 && walletValue > 1) {
    recs.push("Create LP position to start earning fees");
  }
  if (positionCount > 0 && walletValue > 1) {
    recs.push("Add remaining funds to LP position");
  }
  if (positionCount > 0) {
    recs.push("Position actively earning fees");
  }
  if (walletValue < 1 && positionCount === 0) {
    recs.push("Deposit funds to get started");
  }
  return recs.length ? recs : ["Account ready"];
}

export async function positionHandler(c: Context): Promise<Response> {
  try {
    const address = c.req.param("address");
    const agentEns = c.req.query("agent") || c.req.query("agentEns");

    if (!address || !isAddress(address)) {
      return c.json({ success: false, error: "Invalid address", code: "INVALID_ADDRESS" }, 400);
    }

    if (!agentEns) {
      return c.json({ success: false, error: "agent query param is required", code: "MISSING_AGENT" }, 400);
    }

    const ensConfig = await resolveAgentENS(agentEns);
    const strategy = resolveStrategyConfig(ensConfig);
    if (!strategy) {
      return c.json(
        { success: false, error: "Could not resolve strategy from ENS", code: "INVALID_STRATEGY" },
        400
      );
    }

    const client = createChainClient(strategy.chainId);
    const [token0Balance, token1Balance, lpNftCount, btcPrice] = await Promise.all([
      fetchBalance(client, strategy.token0, address),
      fetchBalance(client, strategy.token1, address),
      fetchNFTBalance(client, address, strategy.positionManager),
      fetchBTCPrice(),
    ]);

    const token0Amount = Number(formatUnits(token0Balance, strategy.token0Decimals));
    const token1Amount = Number(formatUnits(token1Balance, strategy.token1Decimals));
    const token0Usd = token0Amount * btcPrice;
    const token1Usd = token1Amount * btcPrice;
    const walletValueUsd = token0Usd + token1Usd;

    const subData = getSubscriptionData(address);
    const positionCount = Number(lpNftCount);
    const totalWallet = token0Amount + token1Amount;
    const token0Ratio = totalWallet > 0 ? token0Amount / totalWallet : 0.5;

    return c.json({
      success: true,
      address,
      chainId: strategy.chainId,
      hasPosition: positionCount > 0,
      walletValueUsd,
      token0Balance: token0Balance.toString(),
      token1Balance: token1Balance.toString(),
      token0Address: strategy.token0,
      token1Address: strategy.token1,
      token0Decimals: strategy.token0Decimals,
      token1Decimals: strategy.token1Decimals,
      token0Symbol: strategy.token0Symbol,
      token1Symbol: strategy.token1Symbol,
      positionCount,
      btcPrice,

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
          raw: token0Balance.toString(),
          formatted: token0Amount.toFixed(strategy.token0Decimals),
          usd: token0Usd.toFixed(2),
        },
        token1: {
          raw: token1Balance.toString(),
          formatted: token1Amount.toFixed(strategy.token1Decimals),
          usd: token1Usd.toFixed(2),
        },
        totalValueUsd: walletValueUsd.toFixed(2),
      },

      lpPositions: {
        count: positionCount,
        positionManager: strategy.positionManager,
        tokenIds: subData?.positionTokenId ? [subData.positionTokenId] : [],
        pool: `${strategy.token0Symbol}/${strategy.token1Symbol}`,
        protocol: strategy.protocol,
      },

      summary: {
        walletValueUsd: walletValueUsd.toFixed(2),
        positionCount,
        token0Ratio: `${(token0Ratio * 100).toFixed(1)}%`,
        hasActivePosition: positionCount > 0,
      },

      market: {
        btcPrice: btcPrice.toFixed(0),
        timestamp: Date.now(),
      },

      recommendations: getRecommendations(positionCount, walletValueUsd),

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
