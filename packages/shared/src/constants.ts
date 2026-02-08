import type { ChainConfig } from "./types.js";
import type { Address } from "viem";

export const CHAINS = {
  ETHEREUM: 1,
  ARBITRUM: 42161,
  GNOSIS: 100,
  POLYGON: 137,
  BASE: 8453,
} as const;

export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  [CHAINS.ETHEREUM]: {
    chainId: CHAINS.ETHEREUM,
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    positionManager: "0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    poolManager: "0x000000000004444c5dc75cB358380D2e3dE08A90",
  },
  [CHAINS.BASE]: {
    chainId: CHAINS.BASE,
    rpcUrl: "https://mainnet.base.org",
    positionManager: "0x7C5f5A4bBd8fD63184577525326123B519429bDc",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
  },
  [CHAINS.ARBITRUM]: {
    chainId: CHAINS.ARBITRUM,
    rpcUrl: "https://arb1.arbitrum.io/rpc",
    positionManager: "0xd88f38f930b7952f2db2432cb002e7abbf3dd869",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    poolManager: "0x360e68faccca8ca495c1b759fd9eee466db9fb32",
  },
};

/** Well-known token addresses per chain for fallback when ENS is incomplete */
export const KNOWN_TOKENS: Record<number, Record<string, { address: Address; decimals: number }>> = {
  [CHAINS.ETHEREUM]: {
    PAXG: { address: "0x45804880De22913dAFE09f4980848ECE6EcbAf78" as Address, decimals: 18 },
    USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address, decimals: 6 },
    WETH: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address, decimals: 18 },
    WBTC: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as Address, decimals: 8 },
    CBBTC: { address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address, decimals: 8 },
    DAI: { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F" as Address, decimals: 18 },
    USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address, decimals: 6 },
  },
  [CHAINS.BASE]: {
    USDC: { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address, decimals: 6 },
    WETH: { address: "0x4200000000000000000000000000000000000006" as Address, decimals: 18 },
    WBTC: { address: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c" as Address, decimals: 8 },
    CBBTC: { address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address, decimals: 8 },
  },
  [CHAINS.ARBITRUM]: {
    USDC: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address, decimals: 6 },
    WETH: { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" as Address, decimals: 18 },
    WBTC: { address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f" as Address, decimals: 8 },
    USDT: { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" as Address, decimals: 6 },
  },
};

export const X402_PRICING = {
  COLLECT_FEE_PERCENT: 10,
  REBALANCE_FEE_USD: 0.1,
  COMPOUND_FEE_PERCENT: 10,
  RANGE_ADJUST_FEE_USD: 0.5,
} as const;

export const AGENT_INTERVALS = {
  POSITION_CHECK_MS: 60 * 60 * 1000,
  SETTLEMENT_MS: 24 * 60 * 60 * 1000,
} as const;
