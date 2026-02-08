/**
 * Deposit Watcher
 *
 * Monitors smart accounts for USDC deposits.
 * When sufficient funds are detected, triggers swap + LP mint flow
 * via the API calldata builder and the session key executor.
 *
 * Strategy (tokens, chain) is resolved dynamically from ENS.
 */

import {
  createPublicClient,
  http,
  formatUnits,
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
// Deposit flow: swap USDC → tokens + mint LP
// ---------------------------------------------------------------------------

/**
 * Execute the full deposit flow for a subscription:
 *   1. Swap ~50% USDC → token0 via LI.FI (API builds calldata)
 *   2. Mint LP position with token0 + remaining USDC (token1)
 *
 * The exact swap amount and mint params are determined by the API
 * based on the agent's ENS strategy config.
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

  // Mark subscription as processing
  updateSubscription(sub.smartAccount, { status: "active", lastActionAt: Date.now() });

  try {
    // Step 1: Ask API to build a "swap" action (USDC → token0)
    // The API knows the strategy from ENS and will use LI.FI
    const usdc = USDC_BY_CHAIN[chainId];
    const halfUsdc = (deposit.usdcBalance / 2n).toString();

    console.log(`${tag} Step 1: Requesting swap calldata (half USDC → token0)...`);
    const swapCalldata = await requestCalldata(apiBase, {
      user: sub.smartAccount,
      agentEns: sub.agentEns,
      actions: [
        {
          type: "swap",
          params: {
            fromToken: usdc.address,
            fromAmount: halfUsdc,
            // toToken resolved from ENS strategy by the API
          },
        },
      ],
    });

    if (!swapCalldata || !swapCalldata.transactions.length) {
      console.error(`${tag} Failed to get swap calldata from API`);
      return;
    }

    console.log(`${tag} Got ${swapCalldata.transactions.length} swap transaction(s), executing...`);
    const swapResult = await executeViaSessionKey(sub, swapCalldata.transactions, chainId);

    if (!swapResult.success) {
      console.error(`${tag} Swap failed: ${swapResult.error}`);
      updateSubscription(sub.smartAccount, { status: "error" });
      return;
    }
    console.log(`${tag} ✅ Swap tx: ${swapResult.txHash}`);

    // Wait for swap to settle
    await new Promise((r) => setTimeout(r, 8000));

    // Read actual token balances after swap
    const strategyRes = await fetch(
      `${apiBase}/api/strategy?agent=${encodeURIComponent(sub.agentEns)}`,
      { signal: AbortSignal.timeout(5000) }
    ).catch(() => null);
    
    let token0 = "0x45804880De22913dAFE09f4980848ECE6EcbAf78" as Address; // PAXG default
    let token1 = usdc.address;
    if (strategyRes?.ok) {
      const stratData = await strategyRes.json();
      if (stratData.token0) token0 = stratData.token0 as Address;
      if (stratData.token1) token1 = stratData.token1 as Address;
    }

    const bal0 = await readTokenBalance(sub.smartAccount, token0, chainId);
    const bal1 = await readTokenBalance(sub.smartAccount, token1, chainId);
    console.log(`${tag} Balances after swap: token0=${bal0.toString()}, token1=${bal1.toString()}`);

    if (bal0 === 0n && bal1 === 0n) {
      console.error(`${tag} No token balances after swap, aborting mint`);
      return;
    }

    // Step 2: Ask API to build a "mint-from-deltas" action (LP position)
    // Use a wide tick range around "full range" for the pool
    // For PAXG/USDC with tickSpacing=100, use wide range
    console.log(`${tag} Step 2: Requesting mint calldata...`);
    const mintCalldata = await requestCalldata(apiBase, {
      user: sub.smartAccount,
      agentEns: sub.agentEns,
      actions: [
        {
          type: "mint-from-deltas",
          params: {
            tickLower: -887200,
            tickUpper: 887200,
            amount0: bal0.toString(),
            amount1: bal1.toString(),
          },
        },
      ],
    });

    if (!mintCalldata || !mintCalldata.transactions.length) {
      console.error(`${tag} Failed to get mint calldata from API`);
      return;
    }

    console.log(`${tag} Got ${mintCalldata.transactions.length} mint transaction(s), executing...`);
    const mintResult = await executeViaSessionKey(sub, mintCalldata.transactions, chainId);

    if (!mintResult.success) {
      console.error(`${tag} Mint failed: ${mintResult.error}`);
      updateSubscription(sub.smartAccount, { status: "error" });
      return;
    }

    console.log(`${tag} ✅ Mint tx: ${mintResult.txHash}`);
    updateSubscription(sub.smartAccount, {
      status: "active",
      lastActionAt: Date.now(),
    });

    console.log(`${tag} 🎉 Full deposit flow complete!`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`${tag} Deposit flow error: ${msg}`);
    updateSubscription(sub.smartAccount, { status: "error" });
  }
}

// ---------------------------------------------------------------------------
// Main watcher loop
// ---------------------------------------------------------------------------

/**
 * Check all active subscriptions for new USDC deposits.
 * Subscriptions without an existing LP position (positionTokenId === null)
 * and with sufficient USDC balance will trigger the deposit flow.
 */
export async function checkPendingDeposits(
  apiBase: string,
  chainId: number = 1
): Promise<void> {
  const subscriptions = loadSubscriptions().filter(
    (s) => s.status === "active" && !s.positionTokenId
  );

  if (subscriptions.length === 0) {
    return; // No pending subscriptions
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

/**
 * Start the deposit watcher polling loop.
 *
 * @param apiBase - URL of the PrismOS API (e.g., "http://localhost:3002")
 * @param chainId - Chain to monitor (default: 1 for Ethereum)
 * @param intervalMs - Polling interval (default: 30s)
 * @returns Timer handle for clearInterval
 */
export function startDepositWatcher(
  apiBase: string,
  chainId: number = 1,
  intervalMs: number = DEFAULT_POLL_INTERVAL_MS
): NodeJS.Timeout {
  console.log(
    `[watcher] Starting deposit watcher on chain ${chainId}, interval ${intervalMs / 1000}s`
  );

  // Run immediately
  checkPendingDeposits(apiBase, chainId).catch((err) => {
    console.error("[watcher] Initial deposit check failed:", err);
  });

  // Then poll
  return setInterval(() => {
    checkPendingDeposits(apiBase, chainId).catch((err) => {
      console.error("[watcher] Deposit check failed:", err);
    });
  }, intervalMs);
}
