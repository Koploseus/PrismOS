/**
 * Market data fetcher.
 * Uses DeFiLlama and CoinGecko for price data.
 */

export interface MarketData {
  btcPrice: number;
  wbtcPrice: number;
  cbbtcPrice: number;
  wbtcCbbtcSpread: number;
  poolApy?: { apy: number };
}

export async function fetchMarketData(): Promise<MarketData> {
  try {
    const res = await fetch(
      "https://coins.llama.fi/prices/current/coingecko:bitcoin,coingecko:wrapped-bitcoin,coingecko:coinbase-wrapped-btc"
    );

    if (!res.ok) {
      console.warn("[market] DeFiLlama fetch failed, using defaults");
      return defaultMarketData();
    }

    const data = await res.json();
    const coins = data.coins || {};

    const btcPrice = coins["coingecko:bitcoin"]?.price ?? 100000;
    const wbtcPrice = coins["coingecko:wrapped-bitcoin"]?.price ?? btcPrice;
    const cbbtcPrice = coins["coingecko:coinbase-wrapped-btc"]?.price ?? btcPrice;
    const spread = cbbtcPrice > 0 ? ((wbtcPrice - cbbtcPrice) / cbbtcPrice) * 100 : 0;

    return {
      btcPrice,
      wbtcPrice,
      cbbtcPrice,
      wbtcCbbtcSpread: spread,
    };
  } catch (error: unknown) {
    console.warn("[market] Error fetching market data:", error instanceof Error ? error.message : error);
    return defaultMarketData();
  }
}

function defaultMarketData(): MarketData {
  return {
    btcPrice: 100000,
    wbtcPrice: 100000,
    cbbtcPrice: 100000,
    wbtcCbbtcSpread: 0,
  };
}
