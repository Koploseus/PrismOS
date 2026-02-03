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
 * Primary chain for PrismOS operations
 */
export const PRIMARY_CHAIN = CHAINS.ARBITRUM;

/**
 * Uniswap v4 contract addresses (Arbitrum)
 * Verified from: https://docs.uniswap.org/contracts/v4/deployments
 */
export const UNISWAP_V4 = {
  POOL_MANAGER: "0x360e68faccca8ca495c1b759fd9eee466db9fb32" as Address,
  POSITION_MANAGER: "0xd88f38f930b7952f2db2432cb002e7abbf3dd869" as Address,
  POSITION_DESCRIPTOR: "0xe2023f3fa515cf070e07fd9d51c1d236e07843f4" as Address,
  UNIVERSAL_ROUTER: "0xa51afafe0263b40edaef0df8781ea9aa03e381a3" as Address,
  QUOTER: "0x3972c00f7ed4885e145823eb7c655375d275a1c5" as Address,
  STATE_VIEW: "0x76fd297e2d437cd7f76d50f01afe6160f86e9990" as Address,
  PERMIT2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address,
} as const;

/**
 * Uniswap v4 contract addresses (Ethereum Mainnet)
 */
export const UNISWAP_V4_ETH = {
  POOL_MANAGER: "0x000000000004444c5dc75cB358380D2e3dE08A90" as Address,
  POSITION_MANAGER: "0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e" as Address,
  STATE_VIEW: "0x7ffe42c4a5deea5b0fec41c94c136cf115597227" as Address,
  PERMIT2: "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address,
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
 * Token addresses (Arbitrum)
 */
export const TOKENS = {
  WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" as Address,
  WSTETH: "0x5979D7b546E38E414F7E9822514be443A4800529" as Address,
  USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address,
  USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" as Address,
  WBTC: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f" as Address,
} as const;

/**
 * Token addresses (Ethereum Mainnet)
 */
export const TOKENS_ETH = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address,
  WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as Address,
  CBBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address,
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
 * Strategy configurations (Arbitrum)
 */
export const STRATEGIES = {
  "eth-wsteth": {
    name: "ETH/wstETH",
    chain: CHAINS.ARBITRUM,
    poolId: "0x315fd6ac8e64cab712b01aa070c01fdab4ca18f5cfda9edfefbc326017f38fb3" as `0x${string}`,
    token0: "0x0000000000000000000000000000000000000000" as Address, // Native ETH
    token1: TOKENS.WSTETH,
    fee: 50, // 0.005%
    tickSpacing: 1,
    hooks: "0x4440854B2d02C57A0Dc5c58b7A884562D875c0c4" as Address, // Has restrictive hooks!
    description: "Low IL, double yield from swap fees + staking rewards",
    estimatedApy: 5,
  },
  "eth-usdt": {
    name: "ETH/USDT",
    chain: CHAINS.ARBITRUM,
    poolId: "0x5923c506df467dfd4880c55143204fcef47d491e2413f465c54c4ff62875c141" as `0x${string}`,
    token0: "0x0000000000000000000000000000000000000000" as Address, // Native ETH
    token1: TOKENS.USDT,
    fee: 250, // 0.025%
    tickSpacing: 5,
    hooks: "0x0000000000000000000000000000000000000000" as Address, // NO HOOKS - works!
    description: "ETH/USDT LP - no restrictive hooks, open access",
    estimatedApy: 8,
  },
  "wbtc-usdc": {
    name: "WBTC/USDC",
    chain: CHAINS.ARBITRUM,
    poolId: "0x80c735c5a0222241f211b3edb8df2ccefad94553ec18f1c29143f0399c78f500" as `0x${string}`,
    token0: TOKENS.WBTC,
    token1: TOKENS.USDC,
    fee: 500, // 0.05%
    tickSpacing: 10,
    hooks: "0x0000000000000000000000000000000000000000" as Address,
    description: "Bitcoin exposure LP strategy with USDC pairing",
    estimatedApy: 12,
  },
} as const;

/**
 * Strategy configurations (Ethereum Mainnet)
 */
export const STRATEGIES_ETH = {
  "wbtc-cbbtc": {
    name: "WBTC/cbBTC",
    chain: CHAINS.ETHEREUM,
    poolId: "0x2f92b371aef58f0abe9c10c06423de083405991f2839638914a1031e91d9a723" as `0x${string}`,
    token0: TOKENS_ETH.WBTC,
    token1: TOKENS_ETH.CBBTC,
    fee: 100, // 0.01%
    tickSpacing: 1,
    hooks: "0x0000000000000000000000000000000000000000" as Address,
    description: "Bitcoin LP strategy - near-zero IL with WBTC/cbBTC pair",
    estimatedApy: 8,
  },
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
