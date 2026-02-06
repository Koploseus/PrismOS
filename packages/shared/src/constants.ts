import type { Address } from "viem";

/**
 * Chain IDs
 */
export const CHAINS = {
  ETHEREUM: 1,
  ARBITRUM: 42161,
  GNOSIS: 100,
  POLYGON: 137,
  BASE: 8453,
} as const;

/**
 * Uniswap v4 contract addresses (Base)
 */
export const UNISWAP_V4_BASE = {
  POOL_MANAGER: "0x498581fF718922c3f8e6A244956aF099B2652b2b" as Address,
  POSITION_MANAGER: "0x7C5f5A4bBd8fD63184577525326123B519429bDc" as Address,
  QUOTER: "0x0d5e0f971ed27fbff6c2837bf31316121532048d" as Address,
  STATE_VIEW: "0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71" as Address,
  UNIVERSAL_ROUTER: "0x6fF5693b99212Da76ad316178A184AB56D299b43" as Address,
  PERMIT2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address,
} as const;

/**
 * Token addresses (Base)
 */
export const TOKENS_BASE = {
  WETH: "0x4200000000000000000000000000000000000006" as Address,
  WBTC: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c" as Address,
  CBBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
} as const;

/**
 * Strategy configurations (Base)
 */
export const STRATEGIES_BASE = {
  "wbtc-cbbtc": {
    name: "WBTC/cbBTC",
    chain: CHAINS.BASE,
    poolId: "0x119e84276578b845bee46a85be30924b7739c151dadaad4f42d6f5869f60a6a3" as `0x${string}`,
    token0: TOKENS_BASE.WBTC,
    token1: TOKENS_BASE.CBBTC,
    fee: 100, // 0.01%
    tickSpacing: 1,
    hooks: "0x0000000000000000000000000000000000000000" as Address,
    description: "Bitcoin LP strategy - near-zero IL with WBTC/cbBTC pair on Base",
    estimatedApy: 10,
    // IMPORTANT: Requires wide tick range (±50000) due to price deviation
    recommendedTickRange: { lower: -50000, upper: 50000 },
  },
} as const;

/**
 * x402 pricing
 */
export const X402_PRICING = {
  /** Fee percentage for collect action */
  COLLECT_FEE_PERCENT: 10,
  /** Flat fee for rebalance (USD) */
  REBALANCE_FEE_USD: 0.1,
  /** Fee percentage for compound action */
  COMPOUND_FEE_PERCENT: 10,
  /** Flat fee for range adjustment (USD) */
  RANGE_ADJUST_FEE_USD: 0.5,
} as const;

/**
 * Agent cron intervals
 */
export const AGENT_INTERVALS = {
  /** Position check interval in ms (1 hour) */
  POSITION_CHECK_MS: 60 * 60 * 1000,
  /** Yellow settlement interval in ms (24 hours) */
  SETTLEMENT_MS: 24 * 60 * 60 * 1000,
} as const;
