/**
 * DeFiLlama market data client.
 */

import type { StrategyConfig } from "../../../../packages/shared/src/types";

export const CHAIN_NAMES: Record<number, string> = {
  1: "ethereum",
  8453: "base",
  42161: "arbitrum",
  137: "polygon",
  100: "gnosis",
};

export interface PoolYield {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apyBase: number | null;
  apyReward: number | null;
  apy: number;
  stablecoin: boolean;
  ilRisk: string;
  exposure: string;
  poolMeta: string | null;
}

export interface MarketData {
  token0Price: number;
  token1Price: number;
  spreadPercent: number;
  poolApy: PoolYield | null;
  alternativePoolApys: PoolYield[];
  protocolChainTvl: number;
  fetchedAt: number;
}

interface CacheEntry {
  data: MarketData;
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function getCacheKey(strategy: StrategyConfig): string {
  return `${strategy.chainId}:${strategy.token0}:${strategy.token1}:${strategy.protocol}`.toLowerCase();
}

function normalizeHexAddress(address: string): string {
  return address.toLowerCase();
}

export async function fetchTokenPrices(
  tokens: Array<{ address: string; chainId: number }>
): Promise<Record<string, number>> {
  const coinIds = tokens
    .map(({ address, chainId }) => {
      const chainName = CHAIN_NAMES[chainId];
      if (!chainName) return null;
      return `${chainName}:${normalizeHexAddress(address)}`;
    })
    .filter((id): id is string => !!id);

  if (coinIds.length === 0) {
    return {};
  }

  try {
    const res = await fetch(`https://coins.llama.fi/prices/current/${coinIds.join(",")}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[defillama] Price fetch failed: ${res.status}`);
      return {};
    }

    const data = await res.json();
    const coinsData = data.coins || {};
    const prices: Record<string, number> = {};

    for (const coinId of coinIds) {
      prices[coinId] = coinsData[coinId]?.price ?? 0;
    }

    return prices;
  } catch (error) {
    console.warn("[defillama] Price fetch error:", error instanceof Error ? error.message : error);
    return {};
  }
}

async function fetchPoolYields(strategy: StrategyConfig): Promise<{
  strategyPool: PoolYield | null;
  topRelatedPools: PoolYield[];
}> {
  try {
    const res = await fetch("https://yields.llama.fi/pools", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`[defillama] Yields fetch failed: ${res.status}`);
      return { strategyPool: null, topRelatedPools: [] };
    }

    const data = await res.json();
    const pools: PoolYield[] = data.data || [];
    const chainName = CHAIN_NAMES[strategy.chainId] || "";
    const sym0 = strategy.token0Symbol.toLowerCase();
    const sym1 = strategy.token1Symbol.toLowerCase();
    const protocol = strategy.protocol.toLowerCase();

    const strategyPool =
      pools.find((p) => {
        const chainMatch = p.chain?.toLowerCase() === chainName;
        const protocolMatch = p.project?.toLowerCase().includes(protocol.split("-")[0] || protocol);
        const symbolText = p.symbol?.toLowerCase() || "";
        const pairMatch = symbolText.includes(sym0) && symbolText.includes(sym1);
        return chainMatch && protocolMatch && pairMatch;
      }) || null;

    const topRelatedPools = pools
      .filter((p) => {
        const symbolText = p.symbol?.toLowerCase() || "";
        return (
          (symbolText.includes(sym0) || symbolText.includes(sym1)) && p.apy > 0 && p.tvlUsd > 100000
        );
      })
      .sort((a, b) => b.apy - a.apy)
      .slice(0, 5);

    return { strategyPool, topRelatedPools };
  } catch (error) {
    console.warn("[defillama] Yields fetch error:", error instanceof Error ? error.message : error);
    return { strategyPool: null, topRelatedPools: [] };
  }
}

async function fetchProtocolTvl(strategy: StrategyConfig): Promise<number> {
  const protocol = strategy.protocol.toLowerCase().replace("-v4", "");
  const chainName = CHAIN_NAMES[strategy.chainId];
  if (!chainName) return 0;

  try {
    const res = await fetch(`https://api.llama.fi/protocol/${protocol}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[defillama] TVL fetch failed: ${res.status}`);
      return 0;
    }

    const data = await res.json();
    const chainTvls = data.currentChainTvls || {};
    const key = chainName.charAt(0).toUpperCase() + chainName.slice(1);
    return chainTvls[key] || 0;
  } catch (error) {
    console.warn("[defillama] TVL fetch error:", error instanceof Error ? error.message : error);
    return 0;
  }
}

export async function fetchMarketData(strategy: StrategyConfig): Promise<MarketData> {
  const cacheKey = getCacheKey(strategy);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const chainName = CHAIN_NAMES[strategy.chainId];
  const [prices, yields, tvl] = await Promise.all([
    fetchTokenPrices([
      { address: strategy.token0, chainId: strategy.chainId },
      { address: strategy.token1, chainId: strategy.chainId },
    ]),
    fetchPoolYields(strategy),
    fetchProtocolTvl(strategy),
  ]);

  const token0Id = `${chainName}:${normalizeHexAddress(strategy.token0)}`;
  const token1Id = `${chainName}:${normalizeHexAddress(strategy.token1)}`;
  const token0Price = prices[token0Id] ?? 0;
  const token1Price = prices[token1Id] ?? 0;
  const spreadPercent = token1Price > 0 ? ((token0Price - token1Price) / token1Price) * 100 : 0;

  const marketData: MarketData = {
    token0Price,
    token1Price,
    spreadPercent,
    poolApy: yields.strategyPool,
    alternativePoolApys: yields.topRelatedPools,
    protocolChainTvl: tvl,
    fetchedAt: Date.now(),
  };

  cache.set(cacheKey, { data: marketData, fetchedAt: Date.now() });
  return marketData;
}
