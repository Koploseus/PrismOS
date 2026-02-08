/**
 * Market data fetcher.
 * Uses DeFiLlama and CoinGecko for price data.
 */

export interface MarketData {
  btcPrice: number;
  token0Price: number;
  token1Price: number;
  spreadPercent: number;
  poolApy?: { apy: number };
}

export async function fetchMarketData(): Promise<MarketData> {
  try {
    const res = await fetch(
      "https://coins.llama.fi/prices/current/coingecko:bitcoin"
    );

    if (!res.ok) {
      console.warn("[market] DeFiLlama fetch failed, using defaults");
      return defaultMarketData();
    }

    const data = await res.json();
    const coins = data.coins || {};

    const btcPrice = coins["coingecko:bitcoin"]?.price ?? 100000;
    return {
      btcPrice,
      token0Price: btcPrice,
      token1Price: btcPrice,
      spreadPercent: 0,
    };
  } catch (error: unknown) {
    console.warn("[market] Error fetching market data:", error instanceof Error ? error.message : error);
    return defaultMarketData();
  }
}

function defaultMarketData(): MarketData {
  return {
    btcPrice: 100000,
    token0Price: 100000,
    token1Price: 100000,
    spreadPercent: 0,
  };
}
