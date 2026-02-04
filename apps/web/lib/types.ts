/**
 * PrismOS Type Definitions
 *
 * Types aligned with ENS text records schema from the protocol.
 * All fees follow the ENS convention:
 * - Percentages in basis points (1000 = 10%)
 * - Flat fees in USDC microunits (100000 = $0.10)
 */

// -----------------------------------------------------------------------------
// Chain & Protocol Types
// -----------------------------------------------------------------------------

export type ChainId = 1 | 42161 | 8453 | 11155111; // mainnet, arbitrum, base, sepolia

export const CHAIN_NAMES: Record<ChainId, string> = {
  1: "Ethereum",
  42161: "Arbitrum",
  8453: "Base",
  11155111: "Sepolia",
};

export type RiskLevel = "low" | "medium" | "high";

export type Protocol = "uniswap-v4" | "uniswap-v3" | "aerodrome" | "camelot";

// -----------------------------------------------------------------------------
// Agent Identity (ENS: agent.*)
// -----------------------------------------------------------------------------

export interface AgentIdentity {
  /** ENS subname (e.g., "yieldbot.prismos.eth") */
  ensName: string;
  /** Display name (ENS: agent.name) */
  name: string;
  /** Agent wallet address (ENS: agent.wallet) */
  wallet: `0x${string}`;
  /** Description (ENS: agent.description) */
  description: string;
  /** Avatar URL or ENS avatar */
  avatar?: string;
  /** Agent version */
  version?: string;
}

// -----------------------------------------------------------------------------
// Agent Strategy (ENS: agent.strategy.*)
// -----------------------------------------------------------------------------

export interface AgentStrategy {
  /** Strategy identifier (ENS: agent.strategy.id) */
  id: string;
  /** Pool address (ENS: agent.strategy.pool) */
  pool: `0x${string}`;
  /** Chain ID (ENS: agent.strategy.chain) */
  chainId: ChainId;
  /** Risk level (ENS: agent.strategy.risk) */
  risk: RiskLevel;
  /** Protocol used */
  protocol: Protocol;
  /** Token pair (e.g., "ETH/wstETH") */
  pair: string;
  /** Strategy description */
  description?: string;
}

// -----------------------------------------------------------------------------
// Agent Fees (ENS: agent.fee.*)
// -----------------------------------------------------------------------------

export interface AgentFees {
  /** Fee on collected fees in basis points (ENS: agent.fee.collect) - 1000 = 10% */
  collect: number;
  /** Flat fee for rebalance in USDC microunits (ENS: agent.fee.rebalance) - 100000 = $0.10 */
  rebalance: number;
  /** Fee on compounded amount in basis points (ENS: agent.fee.compound) - 1000 = 10% */
  compound: number;
  /** Flat fee for range adjustment in USDC microunits (ENS: agent.fee.rangeAdjust) - 500000 = $0.50 */
  rangeAdjust: number;
}

// -----------------------------------------------------------------------------
// Agent Permissions (ENS: agent.permissions, agent.contracts)
// -----------------------------------------------------------------------------

export type AgentPermission =
  | "collect"
  | "modifyLiquidity"
  | "execute"
  | "swap"
  | "bridge"
  | "compound";

export interface AgentPermissions {
  /** Required permissions (ENS: agent.permissions) */
  permissions: AgentPermission[];
  /** Allowed contract addresses (ENS: agent.contracts) */
  contracts: `0x${string}`[];
}

// -----------------------------------------------------------------------------
// Agent Statistics (computed from on-chain activity)
// -----------------------------------------------------------------------------

export interface AgentStats {
  /** Total value locked across all subscribers */
  tvl: number;
  /** Number of active subscribers */
  subscribers: number;
  /** 30-day APY */
  apy30d: number;
  /** Total actions executed */
  totalActions: number;
  /** Success rate percentage */
  successRate: number;
  /** Agent uptime percentage */
  uptime: number;
  /** Date agent was registered */
  registeredAt: Date;
}

// -----------------------------------------------------------------------------
// Complete Agent Type
// -----------------------------------------------------------------------------

export interface Agent {
  /** Unique identifier (derived from ENS) */
  id: string;
  /** Agent identity */
  identity: AgentIdentity;
  /** Agent strategy */
  strategy: AgentStrategy;
  /** Agent fees */
  fees: AgentFees;
  /** Agent permissions */
  permissions: AgentPermissions;
  /** Agent statistics */
  stats: AgentStats;
  /** Agent status */
  status: "active" | "paused" | "deprecated";
}

// -----------------------------------------------------------------------------
// User Configuration (ENS: prismos.* on user's ENS)
// -----------------------------------------------------------------------------

export interface UserConfig {
  /** Selected agent ENS (ENS: prismos.agent) */
  agent: string;
  /** Compound percentage (ENS: prismos.compound) - 70 = 70% reinvested */
  compoundPercent: number;
  /** Destination wallet for distributions (ENS: prismos.destination) */
  destination: `0x${string}`;
  /** Destination chain ID (ENS: prismos.destChain) */
  destChainId: ChainId;
  /** Max daily spend in USDC (ENS: prismos.maxSpend) */
  maxDailySpend: number;
}

// -----------------------------------------------------------------------------
// Activity Log Types
// -----------------------------------------------------------------------------

export type ActivityType =
  | "collect"
  | "rebalance"
  | "compound"
  | "rangeAdjust"
  | "distribute"
  | "subscribe"
  | "unsubscribe";

export interface ActivityLog {
  id: string;
  timestamp: Date;
  type: ActivityType;
  agentId: string;
  /** Transaction hash if on-chain */
  txHash?: `0x${string}`;
  /** Amount involved (in USDC) */
  amount?: number;
  /** Fee paid to agent (in USDC) */
  fee?: number;
  /** Status */
  status: "pending" | "success" | "failed";
  /** Additional details */
  details?: string;
}

// -----------------------------------------------------------------------------
// Types for Dashboard-specific data
// -----------------------------------------------------------------------------

export interface UserPosition {
  /** Position value in USD */
  valueUsd: number;
  /** Token amounts */
  token0Amount: number;
  token0Symbol: string;
  token1Amount: number;
  token1Symbol: string;
  /** Current range */
  rangeLower: number;
  rangeUpper: number;
  /** Is position in range */
  inRange: boolean;
  /** Uncollected fees */
  unclaimedFees: number;
}

export interface SubscriptionStats {
  /** Total fees collected since subscription */
  totalFeesCollected: number;
  /** Total compounded */
  totalCompounded: number;
  /** Total distributed to user */
  totalDistributed: number;
  /** Fees paid to agent */
  feesPaidToAgent: number;
  /** Net yield (after agent fees) */
  netYield: number;
  /** Realized APY */
  realizedApy: number;
  /** Number of actions taken */
  actionsCount: {
    collect: number;
    rebalance: number;
    compound: number;
    rangeAdjust: number;
    distribute: number;
  };
  /** Subscription start date */
  subscribedAt: Date;
}

export interface SubscribedAgent {
  agent: Agent;
  position: UserPosition;
  stats: SubscriptionStats;
  recentActivity: ActivityLog[];
  /** Smart account address for this subscription */
  smartAccount: string;
}

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/** Convert basis points to percentage (1000 -> 10) */
export function bpsToPercent(bps: number): number {
  return bps / 100;
}

/** Convert USDC microunits to dollars (100000 -> 0.10) */
export function microToDollars(micro: number): number {
  return micro / 1_000_000;
}

/** Format fee for display */
export function formatFee(fee: number, isPercent: boolean): string {
  if (isPercent) {
    return `${bpsToPercent(fee)}%`;
  }
  return `$${microToDollars(fee).toFixed(2)}`;
}
