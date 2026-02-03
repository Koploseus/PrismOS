/**
 * Agent Registry Types
 * 
 * Defines the schema for agents registered on the PrismOS marketplace.
 * Agents register via ENS text records (e.g., yieldbot.prismos.eth)
 */

import type { Address } from 'viem';

/**
 * ENS text record keys for Agent Registry
 */
export const AGENT_ENS_KEYS = {
  // Identity
  NAME: 'agent.prismos.name',
  DESCRIPTION: 'agent.prismos.description',
  WALLET: 'agent.prismos.wallet',
  
  // Strategy
  STRATEGY: 'agent.prismos.strategy',
  CHAIN: 'agent.prismos.chain',
  
  // Pricing
  FEE_COLLECT: 'agent.prismos.fee.collect',
  FEE_REBALANCE: 'agent.prismos.fee.rebalance',
  FEE_COMPOUND: 'agent.prismos.fee.compound',
  FEE_RANGE_ADJUST: 'agent.prismos.fee.rangeAdjust',
  
  // Permissions (comma-separated function names)
  PERMISSIONS: 'agent.prismos.permissions',
  
  // Stats (updated by agent)
  SUBSCRIBERS: 'agent.prismos.subscribers',
  TVL: 'agent.prismos.tvl',
  APY: 'agent.prismos.apy',
} as const;

/**
 * ENS text record keys for User Config
 */
export const USER_ENS_KEYS = {
  // Subscription
  AGENT: 'defi.prismos.agent',
  STRATEGY: 'defi.prismos.strategy',
  
  // Distribution preferences
  COMPOUND: 'defi.prismos.compound',
  DESTINATION: 'defi.prismos.destination',
  DEST_CHAIN: 'defi.prismos.destChain',
  
  // Session key (optional, can also be stored off-chain)
  SESSION_GRANT: 'defi.prismos.sessionGrant',
} as const;

/**
 * Agent pricing structure
 */
export interface AgentPricing {
  /** Percentage fee for collect action (e.g., "10" = 10%) */
  collect: string;
  /** Flat fee for rebalance in USD (e.g., "0.10") */
  rebalance: string;
  /** Percentage fee for compound action (e.g., "10" = 10%) */
  compound: string;
  /** Flat fee for range adjustment in USD (e.g., "0.50") */
  rangeAdjust: string;
}

/**
 * Agent permissions - functions the agent needs access to
 */
export type AgentPermission = 
  | 'collect'
  | 'modifyLiquidity'
  | 'increaseLiquidity'
  | 'decreaseLiquidity'
  | 'swap'
  | 'yellowDeposit';

/**
 * Agent metadata from ENS registry
 */
export interface AgentMetadata {
  /** ENS name (e.g., "yieldbot.prismos.eth") */
  ensName: string;
  /** Agent display name */
  name: string;
  /** Agent description */
  description: string;
  /** Agent's wallet address (receives session keys + payments) */
  wallet: Address;
  /** Strategy identifier (e.g., "eth-wsteth-lp-v4") */
  strategy: string;
  /** Primary chain ID (e.g., 42161 for Arbitrum) */
  chainId: number;
  /** Pricing for each action */
  pricing: AgentPricing;
  /** Required permissions for session key */
  permissions: AgentPermission[];
  /** Number of active subscribers (optional) */
  subscribers?: number;
  /** Total value locked in USD (optional) */
  tvl?: string;
  /** Historical APY percentage (optional) */
  apy?: string;
}

/**
 * User subscription config from ENS
 */
export interface UserSubscription {
  /** User's ENS name */
  ensName: string;
  /** User's wallet address */
  address: Address;
  /** Agent wallet they're subscribed to */
  agentWallet: Address;
  /** Strategy identifier */
  strategy: string;
  /** Compound percentage (0-100) */
  compoundPercent: number;
  /** Destination address for yield distribution */
  destination: Address | null;
  /** Destination chain ID */
  destChainId: number | null;
  /** Session key grant (if stored on-chain) */
  sessionGrant?: string;
}

/**
 * Strategy definition
 */
export interface StrategyDefinition {
  /** Strategy ID (e.g., "eth-wsteth-lp-v4") */
  id: string;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Protocol (e.g., "uniswap-v4") */
  protocol: string;
  /** Chain ID */
  chainId: number;
  /** Token 0 address */
  token0: Address;
  /** Token 1 address */
  token1: Address;
  /** Pool fee tier */
  fee: number;
  /** Default tick range (lower) */
  tickLower: number;
  /** Default tick range (upper) */
  tickUpper: number;
  /** Rebalance threshold percentage */
  rebalanceThreshold: number;
  /** Risk level */
  risk: 'low' | 'medium' | 'high';
  /** Estimated APY */
  estimatedApy: number;
}

/**
 * Validation result
 */
export interface RegistryValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Parse permissions string to array
 */
export function parsePermissions(permissionsStr: string): AgentPermission[] {
  if (!permissionsStr) return [];
  return permissionsStr
    .split(',')
    .map(p => p.trim() as AgentPermission)
    .filter(p => p.length > 0);
}

/**
 * Parse percentage string (e.g., "10%" or "10" → 10)
 */
export function parsePercent(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace('%', '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Validate agent metadata
 */
export function validateAgentMetadata(agent: Partial<AgentMetadata>): RegistryValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!agent.name) errors.push('Missing agent name');
  if (!agent.wallet) errors.push('Missing agent wallet');
  if (!agent.strategy) errors.push('Missing strategy');
  if (!agent.chainId) errors.push('Missing chain ID');
  
  if (!agent.pricing?.collect) warnings.push('Missing collect fee');
  if (!agent.pricing?.rebalance) warnings.push('Missing rebalance fee');
  
  if (!agent.permissions?.length) {
    errors.push('Missing permissions');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
