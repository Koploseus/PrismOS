/**
 * DeFiLlama market data client.
 *
 * Fetches token prices, pool yields, and TVL data
 * with a 5-minute in-memory cache.
 */

// Types
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
  btcPrice: number;
  ethPrice: number;
  wbtcPrice: number;
  cbbtcPrice: number;
  wbtcCbbtcSpread: number; // % price difference
  poolApy: PoolYield | null; // WBTC/cbBTC pool on Base
  alternativePoolApys: PoolYield[]; // top 5 BTC pools for comparison
  uniswapBaseTvl: number;
  fetchedAt: number;
}

interface CacheEntry {
  data: MarketData;
  fetchedAt: number;
}

// Cache with 5-minute TTL
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: CacheEntry | null = null;

// DeFiLlama coin IDs
const COIN_IDS = {
  BTC: "coingecko:bitcoin",
  ETH: "coingecko:ethereum",
  WBTC: "base:0x0555E30da8f98308EdB960aa94C0Db47230d2B9c",
  CBBTC: "base:0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
};

/**
 * Fetch token prices from DeFiLlama coins API.
 */
export async function fetchTokenPrices(): Promise<{
  btc: number;
  eth: number;
  wbtc: number;
  cbbtc: number;
}> {
  const defaults = { btc: 100000, eth: 3500, wbtc: 100000, cbbtc: 100000 };

  try {
    const coins = Object.values(COIN_IDS).join(",");
    const res = await fetch(`https://coins.llama.fi/prices/current/${coins}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[defillama] Price fetch failed: ${res.status}`);
      return defaults;
    }

    const data = await res.json();
    const coins_data = data.coins || {};

    return {
      btc: coins_data[COIN_IDS.BTC]?.price ?? defaults.btc,
      eth: coins_data[COIN_IDS.ETH]?.price ?? defaults.eth,
      wbtc: coins_data[COIN_IDS.WBTC]?.price ?? defaults.wbtc,
      cbbtc: coins_data[COIN_IDS.CBBTC]?.price ?? defaults.cbbtc,
    };
  } catch (error) {
    console.warn("[defillama] Price fetch error:", error instanceof Error ? error.message : error);
    return defaults;
  }
}

/**
 * Fetch pool yields from DeFiLlama yields API.
 * Filters for Base chain Uniswap V4 WBTC/cbBTC pools and top BTC pools.
 */
export async function fetchPoolYields(): Promise<{
  wbtcCbbtcPool: PoolYield | null;
  topBtcPools: PoolYield[];
}> {
  try {
    const res = await fetch("https://yields.llama.fi/pools", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`[defillama] Yields fetch failed: ${res.status}`);
      return { wbtcCbbtcPool: null, topBtcPools: [] };
    }

    const data = await res.json();
    const pools: PoolYield[] = data.data || [];

    // Find WBTC/cbBTC pool on Base (Uniswap V4 or V3)
    const wbtcCbbtcPool =
      pools.find(
        (p) =>
          p.chain?.toLowerCase() === "base" &&
          p.project?.toLowerCase().includes("uniswap") &&
          p.symbol?.toLowerCase().includes("wbtc") &&
          p.symbol?.toLowerCase().includes("cbbtc")
      ) || null;

    // Get top 5 BTC-related pools by APY for comparison
    const btcPools = pools
      .filter(
        (p) =>
          (p.symbol?.toLowerCase().includes("btc") ||
            p.symbol?.toLowerCase().includes("wbtc") ||
            p.symbol?.toLowerCase().includes("cbbtc")) &&
          p.apy > 0 &&
          p.tvlUsd > 100000
      )
      .sort((a, b) => b.apy - a.apy)
      .slice(0, 5);

    return { wbtcCbbtcPool, topBtcPools: btcPools };
  } catch (error) {
    console.warn("[defillama] Yields fetch error:", error instanceof Error ? error.message : error);
    return { wbtcCbbtcPool: null, topBtcPools: [] };
  }
}

/**
 * Fetch protocol TVL breakdown by chain.
 */
export async function fetchProtocolTvl(protocol: string): Promise<{
  totalTvl: number;
  baseTvl: number;
}> {
  try {
    const res = await fetch(`https://api.llama.fi/protocol/${protocol}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.warn(`[defillama] TVL fetch failed: ${res.status}`);
      return { totalTvl: 0, baseTvl: 0 };
    }

    const data = await res.json();

    // Get current TVL by chain
    const chainTvls = data.currentChainTvls || {};
    const baseTvl = chainTvls["Base"] || 0;
    const totalTvl = Object.values(chainTvls).reduce(
      (sum: number, tvl) => sum + (typeof tvl === "number" ? tvl : 0),
      0
    );

    return { totalTvl, baseTvl };
  } catch (error) {
    console.warn("[defillama] TVL fetch error:", error instanceof Error ? error.message : error);
    return { totalTvl: 0, baseTvl: 0 };
  }
}

/**
 * Main entry point: fetch all market data with caching.
 */
export async function fetchMarketData(): Promise<MarketData> {
  // Check cache
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  console.log("[defillama] Fetching fresh market data...");

  // Fetch all data in parallel
  const [prices, yields, tvl] = await Promise.all([
    fetchTokenPrices(),
    fetchPoolYields(),
    fetchProtocolTvl("uniswap"),
  ]);

  // Calculate WBTC/cbBTC spread
  const wbtcCbbtcSpread =
    prices.cbbtc > 0 ? ((prices.wbtc - prices.cbbtc) / prices.cbbtc) * 100 : 0;

  const marketData: MarketData = {
    btcPrice: prices.btc,
    ethPrice: prices.eth,
    wbtcPrice: prices.wbtc,
    cbbtcPrice: prices.cbbtc,
    wbtcCbbtcSpread,
    poolApy: yields.wbtcCbbtcPool,
    alternativePoolApys: yields.topBtcPools,
    uniswapBaseTvl: tvl.baseTvl,
    fetchedAt: Date.now(),
  };

  // Update cache
  cache = { data: marketData, fetchedAt: Date.now() };

  console.log(
    `[defillama] Market data: BTC=$${prices.btc.toFixed(0)}, spread=${wbtcCbbtcSpread.toFixed(3)}%, poolAPY=${
      yields.wbtcCbbtcPool?.apy?.toFixed(2) ?? "N/A"
    }%`
  );

  return marketData;
}

/**
 * Clear the cache (useful for testing).
 */
export function clearMarketDataCache(): void {
  cache = null;
}
