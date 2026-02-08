import type { Address, Hex } from "viem";

/**
 * User configuration stored in ENS text records
 */
export interface PrismOSConfig {
  /** LP strategy identifier (e.g., "eth-wsteth") */
  strategy: string;
  /** Agent fee percentage (0-100) */
  agentFee: number;
  /** Compound percentage (0-100) */
  compound: number;
  /** Destination wallet for yield distribution */
  destination: Address;
  /** Destination chain ID (e.g., 100 for Gnosis) */
  destChain: number;
}

/**
 * ENS text record keys for PrismOS config
 */
export const ENS_KEYS = {
  STRATEGY: "defi.prismos.strategy",
  AGENT_FEE: "defi.prismos.agentFee",
  COMPOUND: "defi.prismos.compound",
  DESTINATION: "defi.prismos.destination",
  DEST_CHAIN: "defi.prismos.destChain",
} as const;

/**
 * Uniswap v4 LP Position
 */
export interface LPPosition {
  tokenId: bigint;
  owner: Address;
  token0: Address;
  token1: Address;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  feeGrowthInside0LastX128: bigint;
  feeGrowthInside1LastX128: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
}

/**
 * Agent action types
 */
export type AgentAction =
  | "monitor"
  | "collect"
  | "rebalance"
  | "compound"
  | "adjustRange"
  | "distribute";

/**
 * Agent action log entry
 */
export interface ActionLog {
  id: string;
  timestamp: number;
  action: AgentAction;
  userAddress: Address;
  positionId: bigint;
  txHash?: Hex;
  x402Fee?: string;
  details: Record<string, unknown>;
}

/**
 * Session key permissions for ZeroDev
 */
export interface SessionKeyPermissions {
  /** Allowed contract addresses */
  allowedContracts: Address[];
  /** Allowed function selectors */
  allowedSelectors: Hex[];
  /** Maximum spend limit in USD */
  maxSpendUsd: number;
  /** Expiration timestamp */
  expiresAt: number;
}

export interface ChainConfig {
  chainId: number;
  rpcUrl: string;
  positionManager: `0x${string}`;
  permit2: `0x${string}`;
  poolManager: `0x${string}`;
}

export interface StrategyConfig {
  /** Chain ID the strategy operates on */
  chainId: number;
  /** Pool address (e.g., Uniswap V4 pool ID) */
  pool: `0x${string}`;
  /** Token0 address */
  token0: `0x${string}`;
  /** Token1 address */
  token1: `0x${string}`;
  /** Token0 decimals */
  token0Decimals: number;
  /** Token1 decimals */
  token1Decimals: number;
  /** Token0 symbol */
  token0Symbol: string;
  /** Token1 symbol */
  token1Symbol: string;
  /** Protocol identifier */
  protocol: string;
  /** Position Manager address for this chain */
  positionManager: `0x${string}`;
  /** Permit2 address for this chain */
  permit2: `0x${string}`;
  /** PoolManager address for this chain */
  poolManager: `0x${string}`;
}
