import type { ChainConfig } from "./types.js";
import type { Address } from "viem";

export const CHAINS = {
  ETHEREUM: 1,
} as const;

export const CHAIN_CONFIGS: Record<number, ChainConfig> = {
  [CHAINS.ETHEREUM]: {
    chainId: CHAINS.ETHEREUM,
    rpcUrl: "https://ethereum-rpc.publicnode.com",
    positionManager: "0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e",
    permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    poolManager: "0x000000000004444c5dc75cB358380D2e3dE08A90",
  },
};

/**
 * Token addresses (Ethereum)
 */
export const TOKENS_ETHEREUM = {
  WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as Address,
  CBBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
  PAXG: "0x45804880De22913dAFE09f4980848ECE6EcbAf78" as Address,
  XAUT: "0x68749665FF8D2d112Fa859AA293F07A622782F38" as Address,
} as const;

/** Well-known token addresses per chain for fallback when ENS is incomplete */
export const KNOWN_TOKENS: Record<
  number,
  Record<string, { address: Address; decimals: number }>
> = {
  [CHAINS.ETHEREUM]: {
    PAXG: { address: "0x45804880De22913dAFE09f4980848ECE6EcbAf78" as Address, decimals: 18 },
    USDC: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as Address, decimals: 6 },
    WETH: { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as Address, decimals: 18 },
    WBTC: { address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as Address, decimals: 8 },
    CBBTC: { address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address, decimals: 8 },
    DAI: { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F" as Address, decimals: 18 },
    USDT: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as Address, decimals: 6 },
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

/**
 * Pool Registry
 */

export interface PoolRegistryEntry {
  id: string;
  pairLabel: string;
  poolAddress: Address;
  chainId: number;
  protocol: string;
  feeTier: number;
  token0: Address;
  token1: Address;
  tickSpacing?: number;
  hooks?: Address;
}

export const POOL_REGISTRY: PoolRegistryEntry[] = [
  {
    id: "eth-uniswap-v4-wbtc-cbbtc-100",
    pairLabel: "WBTC/cbBTC",
    poolAddress: "0x2f92b371aef58f0abe9c10c06423de083405991f2839638914a1031e91d9a723" as Address,
    chainId: CHAINS.ETHEREUM,
    protocol: "uniswap-v4",
    feeTier: 100,
    token0: TOKENS_ETHEREUM.WBTC,
    token1: TOKENS_ETHEREUM.CBBTC,
    tickSpacing: 1,
    hooks: "0x0000000000000000000000000000000000000000" as Address,
  },
  {
    id: "eth-uniswap-v4-paxg-xaut-100",
    pairLabel: "PAXG/XAUT",
    poolAddress: "0x4bb2f1067164203bb9007338c523fa7c2fc69bc458c277d285a19650e8ef2239" as Address,
    chainId: CHAINS.ETHEREUM,
    protocol: "uniswap-v4",
    feeTier: 100,
    token0: TOKENS_ETHEREUM.PAXG,
    token1: TOKENS_ETHEREUM.XAUT,
    tickSpacing: 1,
    hooks: "0x0000000000000000000000000000000000000000" as Address,
  },
];

export const FEE_TIER_LABELS: Record<number, string> = {
  100: "0.01%",
  500: "0.05%",
  3000: "0.3%",
  10000: "1%",
};

export function getAvailablePairs(chainId: number, protocol: string): string[] {
  const pairs = new Set<string>();
  for (const entry of POOL_REGISTRY) {
    if (entry.chainId === chainId && entry.protocol === protocol) {
      pairs.add(entry.pairLabel);
    }
  }
  return [...pairs];
}

export function getAvailableFeeTiers(
  chainId: number,
  protocol: string,
  pairLabel: string
): number[] {
  const tiers = new Set<number>();
  for (const entry of POOL_REGISTRY) {
    if (entry.chainId === chainId && entry.protocol === protocol && entry.pairLabel === pairLabel) {
      tiers.add(entry.feeTier);
    }
  }
  return [...tiers].sort((a, b) => a - b);
}

export function resolvePool(
  chainId: number,
  protocol: string,
  pairLabel: string,
  feeTier: number
): PoolRegistryEntry | undefined {
  return POOL_REGISTRY.find(
    (e) =>
      e.chainId === chainId &&
      e.protocol === protocol &&
      e.pairLabel === pairLabel &&
      e.feeTier === feeTier
  );
}

export function protocolHasFeeTiers(protocol: string): boolean {
  return protocol.startsWith("uniswap-");
}
