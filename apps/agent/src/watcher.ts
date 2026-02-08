/**
 * Deposit Watcher
 *
 * Monitors smart accounts for USDC deposits.
 * When sufficient funds are detected, the agent:
 *   1. Reads pool state on-chain (tick, price, fee, tickSpacing)
 *   2. Computes optimal swap amount based on target tick range
 *   3. Requests swap calldata from API (LI.FI) and executes
 *   4. Reads post-swap balances
 *   5. Computes liquidity from balances
 *   6. Requests mint calldata from API with explicit params and executes
 *   7. Extracts positionTokenId from mint tx and stores it
 *
 * The agent owns ALL strategy decisions. The API is a dumb calldata builder.
 */

import {
  createPublicClient,
  http,
  formatUnits,
  parseAbiItem,
  type Address,
  type Chain,
} from "viem";
import { mainnet, base, arbitrum } from "viem/chains";
import {
  loadSubscriptions,
  updateSubscription,
  type AgentSubscription,
} from "./store.js";
import { requestCalldata } from "./apiClient.js";
import { executeViaSessionKey, type ApiTransaction } from "./executor.js";
import { readPoolState, type PoolState } from "./poolState.js";
import {
  computeSwapAmount,
  liquidityForAmounts,
  fullRangeTicks,
  amountsForLiquidity,
} from "./v4Math.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Minimum USDC value (in USD) to trigger the deposit flow */
const MIN_DEPOSIT_USD = 1.0;

/** How often to poll for deposits (ms) */
const DEFAULT_POLL_INTERVAL_MS = 30_000;

/** ERC-20 balanceOf ABI fragment */
const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Well-known USDC addresses per chain */
const USDC_BY_CHAIN: Record<number, { address: Address; decimals: number }> = {
  1: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  8453: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  42161: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
};

const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  8453: base,
  42161: arbitrum,
};

const DEFAULT_RPC: Record<number, string> = {
  1: "https://ethereum-rpc.publicnode.com",
  8453: "https://mainnet.base.org",
  42161: "https://arb1.arbitrum.io/rpc",
};

/** Known PositionManager addresses per chain (for tokenId extraction) */
const POSITION_MANAGER_BY_CHAIN: Record<number, Address> = {
  1: "0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e",
  8453: "0x7C5f5A4bBd8fD63184577525326123B519429bDc",
  42161: "0xd88f38f930b7952f2db2432cb002e7abbf3dd869",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRpcUrl(chainId: number): string {
  const envMap: Record<number, string | undefined> = {
    1: process.env.ETHEREUM_RPC,
    8453: process.env.BASE_RPC,
    42161: process.env.ARBITRUM_RPC,
  };
  return envMap[chainId] || DEFAULT_RPC[chainId] || "";
}

function getPublicClient(chainId: number) {
  const chain = CHAIN_MAP[chainId];
  if (!chain) throw new Error(`[watcher] Unsupported chain: ${chainId}`);
  return createPublicClient({ chain, transport: http(getRpcUrl(chainId)) });
}

// ---------------------------------------------------------------------------
// Balance checking
// ---------------------------------------------------------------------------

interface DepositCheck {
  usdcBalance: bigint;
  usdcValueUsd: number;
  hasDeposit: boolean;
}

async function checkUsdcBalance(
  smartAccount: Address,
  chainId: number
): Promise<DepositCheck> {
  const usdc = USDC_BY_CHAIN[chainId];
  if (!usdc) {
    return { usdcBalance: 0n, usdcValueUsd: 0, hasDeposit: false };
  }

  try {
    const client = getPublicClient(chainId);
    const balance = await client.readContract({
      address: usdc.address,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [smartAccount],
    });

    const valueUsd = Number(formatUnits(balance, usdc.decimals));
    return {
      usdcBalance: balance,
      usdcValueUsd: valueUsd,
      hasDeposit: valueUsd >= MIN_DEPOSIT_USD,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[watcher] Balance check failed for ${smartAccount}:`, msg);
    return { usdcBalance: 0n, usdcValueUsd: 0, hasDeposit: false };
  }
}

async function readTokenBalance(
  smartAccount: Address,
  token: Address,
  chainId: number
): Promise<bigint> {
  try {
    const client = getPublicClient(chainId);
    return await client.readContract({
      address: token,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [smartAccount],
    });
  } catch {
    return 0n;
  }
}

// ---------------------------------------------------------------------------
// Strategy resolution — fetch token addresses from API
// ---------------------------------------------------------------------------

interface StrategyInfo {
  token0: Address;
  token1: Address;
  token0Decimals: number;
  token1Decimals: number;
  fee: number;
  tickSpacing: number;
}

async function resolveStrategy(
  apiBase: string,
  agentEns: string,
  chainId: number
): Promise<StrategyInfo> {
  // Defaults for PAXG/USDC on mainnet
  const defaults: StrategyInfo = {
    token0: "0x45804880De22913dAFE09f4980848ECE6EcbAf78" as Address,
    token1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
    token0Decimals: 18,
    token1Decimals: 6,
    fee: 3000,
    tickSpacing: 60,
  };

  try {
    const res = await fetch(
      `${apiBase}/api/strategy?agent=${encodeURIComponent(agentEns)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (res.ok) {
      const data = await res.json();
      return {
        token0: (data.token0 as Address) || defaults.token0,
        token1: (data.token1 as Address) || defaults.token1,
        token0Decimals: data.token0Decimals ?? defaults.token0Decimals,
        token1Decimals: data.token1Decimals ?? defaults.token1Decimals,
        fee: data.fee ?? defaults.fee,
        tickSpacing: data.tickSpacing ?? defaults.tickSpacing,
      };
    }
  } catch {
    // Fallback to defaults
  }

  return defaults;
}

// ---------------------------------------------------------------------------
// Token ID extraction from mint tx receipt
// ---------------------------------------------------------------------------

/**
 * Parse a mint transaction receipt to extract the ERC-721 tokenId
 * from the Transfer(address,address,uint256) event emitted by
 * PositionManager.
 */
async function extractPositionTokenId(
  txHash: string,
  chainId: number,
  smartAccount: Address
): Promise<string | null> {
  try {
    const client = getPublicClient(chainId);
    const receipt = await client.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    const positionManager = POSITION_MANAGER_BY_CHAIN[chainId];
    if (!positionManager) return null;

    // ERC-721 Transfer event: Transfer(address from, address to, uint256 tokenId)
    // topic0 = keccak256("Transfer(address,address,uint256)")
    const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

    for (const log of receipt.logs) {
      // Must be from PositionManager
      if (log.address.toLowerCase() !== positionManager.toLowerCase()) continue;
      // Must be Transfer event
      if (!log.topics[0] || log.topics[0] !== TRANSFER_TOPIC) continue;
      // Must have 4 topics (ERC-721: topic0 + from + to + tokenId are indexed)
      if (log.topics.length < 4) continue;

      // topics[2] = 'to' address (padded to 32 bytes)
      const toAddress = "0x" + log.topics[2]!.slice(26);
      if (toAddress.toLowerCase() !== smartAccount.toLowerCase()) continue;

      // topics[3] = tokenId (uint256, indexed)
      const tokenId = BigInt(log.topics[3]!).toString();
      console.log(`[watcher] Extracted positionTokenId: ${tokenId} from tx ${txHash}`);
      return tokenId;
    }

    console.warn(`[watcher] Could not find Transfer event for ${smartAccount} in tx ${txHash}`);
    return null;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown";
    console.warn(`[watcher] Failed to extract tokenId from ${txHash}: ${msg}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Deposit flow: the agent's core intelligence
// ---------------------------------------------------------------------------

/**
 * Execute the full deposit flow for a subscription:
 *
 *   Phase 1: ANALYZE — Read pool state, compute strategy
 *   Phase 2: SWAP — Convert optimal amount of USDC to token0 via LI.FI
 *   Phase 3: MINT — Create LP position with explicit liquidity + params
 *   Phase 4: RECORD — Extract positionTokenId and store in subscription
 */
async function handleDeposit(
  sub: AgentSubscription,
  deposit: DepositCheck,
  apiBase: string,
  chainId: number
): Promise<void> {
  const tag = `[watcher:${sub.smartAccount.slice(0, 8)}]`;
  console.log(
    `${tag} 💰 Deposit detected: $${deposit.usdcValueUsd.toFixed(2)} USDC on chain ${chainId}`
  );

  updateSubscription(sub.smartAccount, { status: "processing", lastActionAt: Date.now() });

  try {
    const usdc = USDC_BY_CHAIN[chainId]!;

    // -----------------------------------------------------------------------
    // Phase 1: ANALYZE — Read pool state and compute strategy
    // -----------------------------------------------------------------------
    console.log(`${tag} Phase 1: Analyzing pool state...`);

    const strategy = await resolveStrategy(apiBase, sub.agentEns, chainId);
    console.log(`${tag} Strategy: ${strategy.token0.slice(0, 10)}/${strategy.token1.slice(0, 10)}, fee=${strategy.fee}, ts=${strategy.tickSpacing}`);

    // Read live pool state from chain via StateView
    const poolState = await readPoolState(
      chainId,
      strategy.token0,
      strategy.token1,
      strategy.fee,
      strategy.tickSpacing
    );

    // Agent decides tick range (full range for v1, later: tighter ranges)
    const { tickLower, tickUpper } = fullRangeTicks(strategy.tickSpacing);

    let swapAmount: bigint;

    if (poolState) {
      console.log(`${tag} Pool state: tick=${poolState.tick}, sqrtP=${poolState.sqrtPriceX96}`);

      // Compute optimal swap amount based on pool price and tick range
      swapAmount = computeSwapAmount(
        deposit.usdcBalance,
        poolState.sqrtPriceX96,
        tickLower,
        tickUpper,
        50n // 0.5% fee buffer
      );

      console.log(`${tag} Optimal swap: ${formatUnits(swapAmount, 6)} USDC → token0 (${((Number(swapAmount) / Number(deposit.usdcBalance)) * 100).toFixed(1)}%)`);
    } else {
      // Fallback: 50% swap if pool state unavailable
      swapAmount = deposit.usdcBalance / 2n;
      console.warn(`${tag} ⚠️ Pool state unavailable, using 50% swap fallback`);
    }

    if (swapAmount === 0n) {
      console.log(`${tag} No swap needed (position is one-sided token1)`);
    }

    // -----------------------------------------------------------------------
    // Phase 2: SWAP — Convert USDC to token0 via LI.FI
    // -----------------------------------------------------------------------
    if (swapAmount > 0n) {
      console.log(`${tag} Phase 2: Swapping ${formatUnits(swapAmount, 6)} USDC → token0...`);

      const swapCalldata = await requestCalldata(apiBase, {
        user: sub.smartAccount,
        agentEns: sub.agentEns,
        actions: [
          {
            type: "swap",
            params: {
              fromToken: usdc.address,
              fromAmount: swapAmount.toString(),
              toToken: strategy.token0,
            },
          },
        ],
      });

      if (!swapCalldata || !swapCalldata.transactions.length) {
        console.error(`${tag} Failed to get swap calldata from API`);
        updateSubscription(sub.smartAccount, { status: "active" });
        return;
      }

      console.log(`${tag} Got ${swapCalldata.transactions.length} swap tx(s), executing...`);
      const swapResult = await executeViaSessionKey(sub, swapCalldata.transactions, chainId);

      if (!swapResult.success) {
        console.error(`${tag} Swap failed: ${swapResult.error}`);
        updateSubscription(sub.smartAccount, { status: "active" }); // Reset for retry
        return;
      }
      console.log(`${tag} ✅ Swap tx: ${swapResult.txHash}`);

      // Wait for swap to settle on-chain before reading balances
      console.log(`${tag} Waiting 15s for swap to settle...`);
      await new Promise((r) => setTimeout(r, 15_000));
    }
    // -----------------------------------------------------------------------
    // Phase 3: MINT — Create LP position with explicit params
    // -----------------------------------------------------------------------
    console.log(`${tag} Phase 3: Minting LP position...`);

    // Read actual post-swap balances
    const bal0 = await readTokenBalance(sub.smartAccount, strategy.token0, chainId);
    const bal1 = await readTokenBalance(sub.smartAccount, strategy.token1, chainId);
    console.log(
      `${tag} Balances: token0=${formatUnits(bal0, strategy.token0Decimals)}, token1=${formatUnits(bal1, strategy.token1Decimals)}`
    );

    if (bal0 === 0n && bal1 === 0n) {
      console.error(`${tag} No token balances after swap, aborting mint`);
      updateSubscription(sub.smartAccount, { status: "active" });
      return;
    }

    // Compute liquidity from actual balances
    let liquidity: bigint;
    if (poolState) {
      liquidity = liquidityForAmounts(
        poolState.sqrtPriceX96,
        tickLower,
        tickUpper,
        bal0,
        bal1
      );
      console.log(`${tag} Computed liquidity: ${liquidity}`);

      // Verify amounts make sense
      const expected = amountsForLiquidity(poolState.sqrtPriceX96, tickLower, tickUpper, liquidity);
      console.log(`${tag} Expected amounts for this liquidity: a0=${expected.amount0}, a1=${expected.amount1}`);
    } else {
      // Fallback: use a reasonable liquidity estimate
      // This is a rough estimate; with pool state it would be exact
      liquidity = bal0 > 0n ? bal0 : bal1;
      console.warn(`${tag} ⚠️ Using fallback liquidity estimate: ${liquidity}`);
    }

    if (liquidity === 0n) {
      console.error(`${tag} Computed liquidity is 0, aborting mint`);
      updateSubscription(sub.smartAccount, { status: "active" });
      return;
    }

    // Request mint calldata with ALL explicit parameters
    const mintCalldata = await requestCalldata(apiBase, {
      user: sub.smartAccount,
      agentEns: sub.agentEns,
      actions: [
        {
          type: "mint",
          params: {
            // Pool key — agent provides these explicitly
            fee: strategy.fee,
            tickSpacing: strategy.tickSpacing,
            hooks: "0x0000000000000000000000000000000000000000",
            // Position params — agent decides these
            tickLower,
            tickUpper,
            liquidity: liquidity.toString(),
            // Slippage caps — use actual balances as max
            amount0: bal0.toString(),
            amount1: bal1.toString(),
          },
        },
      ],
    });

    if (!mintCalldata || !mintCalldata.transactions.length) {
      console.error(`${tag} Failed to get mint calldata from API`);
      updateSubscription(sub.smartAccount, { status: "active" });
      return;
    }

    console.log(`${tag} Got ${mintCalldata.transactions.length} mint tx(s), executing...`);
    const mintResult = await executeViaSessionKey(sub, mintCalldata.transactions, chainId);

    if (!mintResult.success) {
      console.error(`${tag} Mint failed: ${mintResult.error}`);
      updateSubscription(sub.smartAccount, { status: "error" });
      return;
    }

    console.log(`${tag} ✅ Mint tx: ${mintResult.txHash}`);

    // -----------------------------------------------------------------------
    // Phase 4: RECORD — Extract positionTokenId from mint tx
    // -----------------------------------------------------------------------
    let positionTokenId: string | null = null;
    if (mintResult.txHash) {
      console.log(`${tag} Phase 4: Extracting positionTokenId from mint tx...`);
      positionTokenId = await extractPositionTokenId(
        mintResult.txHash,
        chainId,
        sub.smartAccount
      );
    }

    updateSubscription(sub.smartAccount, {
      status: "active",
      lastActionAt: Date.now(),
      ...(positionTokenId ? { positionTokenId } : {}),
    });

    if (positionTokenId) {
      console.log(`${tag} 🎉 Full deposit flow complete! positionTokenId=${positionTokenId}`);
    } else {
      console.log(`${tag} 🎉 Full deposit flow complete! (positionTokenId not extracted — will be detected on next loop)`);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`${tag} Deposit flow error: ${msg}`);
    updateSubscription(sub.smartAccount, { status: "error" });
  }
}

// ---------------------------------------------------------------------------
// Main watcher loop
// ---------------------------------------------------------------------------

export async function checkPendingDeposits(
  apiBase: string,
  chainId: number = 1
): Promise<void> {
  const subscriptions = loadSubscriptions().filter(
    (s) => s.status === "active" && !s.positionTokenId
  );

  if (subscriptions.length === 0) {
    return;
  }

  console.log(`[watcher] Checking ${subscriptions.length} subscription(s) for deposits on chain ${chainId}...`);

  for (const sub of subscriptions) {
    try {
      const deposit = await checkUsdcBalance(sub.smartAccount, chainId);

      if (deposit.hasDeposit) {
        await handleDeposit(sub, deposit, apiBase, chainId);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[watcher] Error checking ${sub.smartAccount}: ${msg}`);
    }
  }
}

export function startDepositWatcher(
  apiBase: string,
  chainId: number = 1,
  intervalMs: number = DEFAULT_POLL_INTERVAL_MS
): NodeJS.Timeout {
  console.log(
    `[watcher] Starting deposit watcher on chain ${chainId}, interval ${intervalMs / 1000}s`
  );

  checkPendingDeposits(apiBase, chainId).catch((err) => {
    console.error("[watcher] Initial deposit check failed:", err);
  });

  return setInterval(() => {
    checkPendingDeposits(apiBase, chainId).catch((err) => {
      console.error("[watcher] Deposit check failed:", err);
    });
  }, intervalMs);
}
