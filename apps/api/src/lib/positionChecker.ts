/**
 * On-chain position & balance queries for smart accounts.
 *
 * Uses per-token USD pricing via CoinGecko (not BTC price for everything).
 */

import { createPublicClient, http, Address, formatUnits } from "viem";
import { CHAIN_CONFIGS } from "../../../../packages/shared/src/constants";
import type { StrategyConfig } from "../../../../packages/shared/src/types";

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const ERC721_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export function createChainClient(chainId: number) {
  const chainConfig = CHAIN_CONFIGS[chainId];
  if (!chainConfig) {
    throw new Error(`Unsupported chainId ${chainId}`);
  }
  return createPublicClient({ transport: http(chainConfig.rpcUrl) });
}

export async function fetchBalance(
  client: ReturnType<typeof createChainClient>,
  token: Address,
  account: Address
): Promise<bigint> {
  return client.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account],
  });
}

export async function fetchNFTBalance(
  client: ReturnType<typeof createChainClient>,
  account: Address,
  positionManager: Address
): Promise<bigint> {
  try {
    return await client.readContract({
      address: positionManager,
      abi: ERC721_ABI,
      functionName: "balanceOf",
      args: [account],
    });
  } catch {
    return 0n;
  }
}

// ---------------------------------------------------------------------------
// Per-token pricing via CoinGecko
// ---------------------------------------------------------------------------

/**
 * Map of well-known token symbols to CoinGecko IDs.
 * Stablecoins (USDC, USDT, DAI) are hardcoded to $1.
 */
const SYMBOL_TO_COINGECKO: Record<string, string> = {
  WBTC: "bitcoin",
  CBBTC: "bitcoin",
  BTC: "bitcoin",
  WETH: "ethereum",
  ETH: "ethereum",
  PAXG: "pax-gold",
  // Stablecoins are handled separately — always $1
};

const STABLECOINS = new Set([
  "USDC",
  "USDT",
  "DAI",
  "BUSD",
  "TUSD",
  "FRAX",
  "LUSD",
  "GUSD",
  "USDP",
]);

export interface TokenPrices {
  token0PriceUsd: number;
  token1PriceUsd: number;
}

/**
 * Fetch USD prices for token0 and token1 by symbol.
 * Stablecoins return $1. Unknown tokens try CoinGecko by address.
 */
export async function fetchTokenPrices(
  token0Symbol: string,
  token1Symbol: string,
  token0Address?: string,
  token1Address?: string
): Promise<TokenPrices> {
  const price0 = await fetchSingleTokenPrice(token0Symbol, token0Address);
  const price1 = await fetchSingleTokenPrice(token1Symbol, token1Address);
  return { token0PriceUsd: price0, token1PriceUsd: price1 };
}

async function fetchSingleTokenPrice(symbol: string, address?: string): Promise<number> {
  const sym = symbol.toUpperCase();

  // Stablecoins
  if (STABLECOINS.has(sym)) return 1.0;

  // Known CoinGecko IDs
  const geckoId = SYMBOL_TO_COINGECKO[sym];
  if (geckoId) {
    return fetchCoinGeckoPrice(geckoId);
  }

  // Try by contract address on Ethereum
  if (address) {
    return fetchCoinGeckoPriceByAddress(address);
  }

  // Unknown token — return 0 (caller should handle)
  console.warn(`[positionChecker] Unknown token price for ${symbol}, returning 0`);
  return 0;
}

async function fetchCoinGeckoPrice(geckoId: string): Promise<number> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    return data[geckoId]?.usd ?? 0;
  } catch {
    console.warn(`[positionChecker] CoinGecko price fetch failed for ${geckoId}`);
    return 0;
  }
}

async function fetchCoinGeckoPriceByAddress(address: string): Promise<number> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${address}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json();
    return data[address.toLowerCase()]?.usd ?? 0;
  } catch {
    console.warn(`[positionChecker] CoinGecko price fetch by address failed for ${address}`);
    return 0;
  }
}

/**
 * @deprecated Use fetchTokenPrices instead. Kept for backward compat in loop.ts market data.
 */
export async function fetchBTCPrice(): Promise<number> {
  return fetchCoinGeckoPrice("bitcoin");
}

// ---------------------------------------------------------------------------
// Position snapshot
// ---------------------------------------------------------------------------

export interface PositionSnapshot {
  hasPosition: boolean;
  walletValueUsd: number;
  token0Balance: bigint;
  token1Balance: bigint;
  token0Address: Address;
  token1Address: Address;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  positionCount: number;
  token0PriceUsd: number;
  token1PriceUsd: number;
  /** @deprecated Use token0PriceUsd/token1PriceUsd instead */
  btcPrice: number;
}

export async function checkSmartAccountPosition(
  address: Address,
  strategy: StrategyConfig
): Promise<PositionSnapshot> {
  const client = createChainClient(strategy.chainId);

  const [token0Balance, token1Balance, lpNftCount, prices] = await Promise.all([
    fetchBalance(client, strategy.token0, address),
    fetchBalance(client, strategy.token1, address),
    fetchNFTBalance(client, address, strategy.positionManager),
    fetchTokenPrices(
      strategy.token0Symbol,
      strategy.token1Symbol,
      strategy.token0,
      strategy.token1
    ),
  ]);

  const token0Amount = Number(formatUnits(token0Balance, strategy.token0Decimals));
  const token1Amount = Number(formatUnits(token1Balance, strategy.token1Decimals));
  const walletValueUsd =
    token0Amount * prices.token0PriceUsd + token1Amount * prices.token1PriceUsd;
  const positionCount = Number(lpNftCount);

  return {
    hasPosition: positionCount > 0,
    walletValueUsd,
    token0Balance,
    token1Balance,
    token0Address: strategy.token0,
    token1Address: strategy.token1,
    token0Symbol: strategy.token0Symbol,
    token1Symbol: strategy.token1Symbol,
    token0Decimals: strategy.token0Decimals,
    token1Decimals: strategy.token1Decimals,
    positionCount,
    token0PriceUsd: prices.token0PriceUsd,
    token1PriceUsd: prices.token1PriceUsd,
    btcPrice: prices.token0PriceUsd, // deprecated compat field
  };
}
