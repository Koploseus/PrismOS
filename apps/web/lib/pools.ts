/**
 * Pool Registry & Helpers
 *
 * Mirrors the registry in packages/shared/src/constants.ts — keep in sync.
 */

import type { Address } from "viem";

export interface PoolRegistryEntry {
  id: string;
  pairLabel: string;
  poolId: Address;
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
    poolId: "0x2f92b371aef58f0abe9c10c06423de083405991f2839638914a1031e91d9a723",
    chainId: 1,
    protocol: "uniswap-v4",
    feeTier: 100,
    token0: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    token1: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    tickSpacing: 1,
    hooks: "0x0000000000000000000000000000000000000000",
  },
  {
    id: "eth-uniswap-v4-paxg-xaut-100",
    pairLabel: "PAXG/XAUT",
    poolId: "0x4bb2f1067164203bb9007338c523fa7c2fc69bc458c277d285a19650e8ef2239",
    chainId: 1,
    protocol: "uniswap-v4",
    feeTier: 100,
    token0: "0x45804880De22913dAFE09f4980848ECE6EcbAf78",
    token1: "0x68749665FF8D2d112Fa859AA293F07A622782F38",
    tickSpacing: 1,
    hooks: "0x0000000000000000000000000000000000000000",
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
