/**
 * On-chain Pool State Reader
 *
 * Reads Uniswap V4 pool state from the deployed StateView contract.
 * The agent uses this to make informed decisions about swap ratios
 * and tick ranges.
 */

import {
  createPublicClient,
  http,
  keccak256,
  encodeAbiParameters,
  zeroAddress,
  type Address,
  type Chain,
} from "viem";
import { mainnet, base, arbitrum } from "viem/chains";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** StateView contract addresses per chain (Uniswap V4 periphery) */
const STATE_VIEW_BY_CHAIN: Record<number, Address> = {
  1: "0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227",
  // TODO: Add Base/Arbitrum StateView addresses when available
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

const STATE_VIEW_ABI = [
  {
    name: "getSlot0",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
  },
  {
    name: "getLiquidity",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [{ name: "liquidity", type: "uint128" }],
  },
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PoolKey {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
}

export interface PoolState {
  poolId: `0x${string}`;
  sqrtPriceX96: bigint;
  tick: number;
  protocolFee: number;
  lpFee: number;
  liquidity: bigint;
  poolKey: PoolKey;
}

// ---------------------------------------------------------------------------
// PoolId computation
// ---------------------------------------------------------------------------

/**
 * Compute the V4 PoolId from a PoolKey.
 * PoolId = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))
 *
 * IMPORTANT: currency0 MUST be < currency1 (sorted by address).
 */
export function computePoolId(poolKey: PoolKey): `0x${string}` {
  const encoded = encodeAbiParameters(
    [
      { name: "currency0", type: "address" },
      { name: "currency1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickSpacing", type: "int24" },
      { name: "hooks", type: "address" },
    ],
    [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks]
  );
  return keccak256(encoded);
}

/**
 * Sort tokens to get the correct currency0/currency1 ordering.
 * In V4, currency0 < currency1 by address value.
 */
export function sortTokens(
  tokenA: Address,
  tokenB: Address
): { currency0: Address; currency1: Address } {
  if (tokenA.toLowerCase() < tokenB.toLowerCase()) {
    return { currency0: tokenA, currency1: tokenB };
  }
  return { currency0: tokenB, currency1: tokenA };
}

// ---------------------------------------------------------------------------
// On-chain reads
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
  if (!chain) throw new Error(`[poolState] Unsupported chain: ${chainId}`);
  return createPublicClient({ chain, transport: http(getRpcUrl(chainId)) });
}

/**
 * Read the current pool state from the on-chain StateView contract.
 *
 * @param chainId - Chain ID (1 = Ethereum mainnet)
 * @param token0 - First token address (will be sorted)
 * @param token1 - Second token address (will be sorted)
 * @param fee - Pool fee tier (e.g. 3000 for 0.3%)
 * @param tickSpacing - Pool tick spacing (e.g. 60)
 * @param hooks - Pool hooks address (usually 0x0)
 */
export async function readPoolState(
  chainId: number,
  token0: Address,
  token1: Address,
  fee: number = 3000,
  tickSpacing: number = 60,
  hooks: Address = zeroAddress
): Promise<PoolState | null> {
  const stateView = STATE_VIEW_BY_CHAIN[chainId];
  if (!stateView) {
    console.warn(`[poolState] No StateView address for chain ${chainId}`);
    return null;
  }

  try {
    const { currency0, currency1 } = sortTokens(token0, token1);
    const poolKey: PoolKey = { currency0, currency1, fee, tickSpacing, hooks };
    const poolId = computePoolId(poolKey);

    const client = getPublicClient(chainId);

    // Read slot0 and liquidity in parallel
    const [slot0Result, liquidityResult] = await Promise.all([
      client.readContract({
        address: stateView,
        abi: STATE_VIEW_ABI,
        functionName: "getSlot0",
        args: [poolId],
      }),
      client.readContract({
        address: stateView,
        abi: STATE_VIEW_ABI,
        functionName: "getLiquidity",
        args: [poolId],
      }),
    ]);

    const [sqrtPriceX96, tick, protocolFee, lpFee] = slot0Result;

    if (sqrtPriceX96 === 0n) {
      console.warn(`[poolState] Pool ${poolId} has sqrtPriceX96=0, may not be initialized`);
      return null;
    }

    const state: PoolState = {
      poolId,
      sqrtPriceX96,
      tick,
      protocolFee,
      lpFee,
      liquidity: liquidityResult,
      poolKey,
    };

    console.log(
      `[poolState] Pool ${poolId.slice(0, 10)}... tick=${tick}, sqrtP=${sqrtPriceX96}, liq=${liquidityResult}`
    );

    return state;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[poolState] Failed to read pool state on chain ${chainId}:`, msg);
    return null;
  }
}
