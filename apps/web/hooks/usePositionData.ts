"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPublicClient, http, formatUnits, type Address, type PublicClient } from "viem";
import { arbitrum, base } from "viem/chains";
import { api, isSuccess, type PositionData } from "@/lib/api";

export interface BalanceData {
  eth: string;
  ethUsd: number;
  wsteth?: string;
  wstethUsd?: number;
  weth?: string;
  wethUsd?: number;
  wbtc: string;
  wbtcUsd: number;
  cbbtc?: string;
  cbbtcUsd?: number;
  usdc: string;
  usdcUsd: number;
  usdt?: string;
  usdtUsd?: number;
  totalUsd: number;
}

export interface PositionInfo {
  tokenIds: bigint[];
  count: number;
  inRange?: boolean;
  needsRebalance?: boolean;
}

export interface WalletData {
  balances: BalanceData | null;
  positions: PositionInfo | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

export interface UsePositionDataOptions {
  chainId?: number;
  useApi?: boolean;
  refreshInterval?: number;
}

export const TOKEN_ADDRESSES = {
  [arbitrum.id]: {
    WSTETH: "0x5979D7b546E38E414F7E9822514be443A4800529" as Address,
    WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1" as Address,
    WBTC: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f" as Address,
    USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as Address,
    USDT: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" as Address,
  },
  [base.id]: {
    WETH: "0x4200000000000000000000000000000000000006" as Address,
    WBTC: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c" as Address,
    CBBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address,
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  },
} as const;

export const POSITION_MANAGER_ADDRESSES = {
  [arbitrum.id]: "0xd88f38f930b7952f2db2432cb002e7abbf3dd869" as Address,
  [base.id]: "0x7C5f5A4bBd8fD63184577525326123B519429bdc" as Address,
} as const;

const TOKEN_DECIMALS: Record<string, number> = {
  WSTETH: 18,
  WETH: 18,
  WBTC: 8,
  CBBTC: 8,
  USDC: 6,
  USDT: 6,
};

const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const POSITION_MANAGER_ABI = [
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    name: "tokenOfOwnerByIndex",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// TODO: Replace with oracle integration (Chainlink, Pyth)
const STATIC_PRICES: Record<string, number> = {
  ETH: 3500,
  WETH: 3500,
  WSTETH: 4000,
  WBTC: 95000,
  CBBTC: 95000,
  USDC: 1,
  USDT: 1,
};

const DEFAULT_REFRESH_INTERVAL_MS = 30_000;

const RPC_URLS: Record<number, string> = {
  [arbitrum.id]: process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || "https://arb1.arbitrum.io/rpc",
  [base.id]: process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://mainnet.base.org",
};

function getPublicClient(chainId: number): PublicClient {
  const chain = chainId === base.id ? base : arbitrum;
  const rpcUrl = RPC_URLS[chainId] || RPC_URLS[arbitrum.id];

  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  }) as PublicClient;
}

function getTokenPrice(symbol: string): number {
  return STATIC_PRICES[symbol.toUpperCase()] ?? 0;
}

function formatBalance(rawBalance: bigint, decimals: number): string {
  return formatUnits(rawBalance, decimals);
}

function calculateUsdValue(amount: string, price: number): number {
  const numAmount = parseFloat(amount) || 0;
  return numAmount * price;
}

async function fetchTokenBalance(
  client: PublicClient,
  tokenAddress: Address,
  walletAddress: Address
): Promise<bigint> {
  try {
    return await client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [walletAddress],
    });
  } catch (error) {
    console.warn(`[usePositionData] Failed to fetch balance for ${tokenAddress}:`, error);
    return 0n;
  }
}

async function fetchEthBalance(client: PublicClient, walletAddress: Address): Promise<bigint> {
  try {
    return await client.getBalance({ address: walletAddress });
  } catch (error) {
    console.warn("[usePositionData] Failed to fetch ETH balance:", error);
    return 0n;
  }
}

async function fetchPositionCount(
  client: PublicClient,
  positionManager: Address,
  walletAddress: Address
): Promise<number> {
  try {
    const count = await client.readContract({
      address: positionManager,
      abi: POSITION_MANAGER_ABI,
      functionName: "balanceOf",
      args: [walletAddress],
    });
    return Number(count);
  } catch (error) {
    console.warn("[usePositionData] Failed to fetch position count:", error);
    return 0;
  }
}

async function fetchPositionTokenIds(
  client: PublicClient,
  positionManager: Address,
  walletAddress: Address,
  count: number
): Promise<bigint[]> {
  if (count === 0) return [];

  try {
    const tokenIdPromises = Array.from({ length: count }, (_, index) =>
      client.readContract({
        address: positionManager,
        abi: POSITION_MANAGER_ABI,
        functionName: "tokenOfOwnerByIndex",
        args: [walletAddress, BigInt(index)],
      })
    );

    return await Promise.all(tokenIdPromises);
  } catch (error) {
    console.warn("[usePositionData] Failed to fetch position token IDs:", error);
    return [];
  }
}

async function fetchOnChainBalances(
  client: PublicClient,
  walletAddress: Address,
  chainId: number
): Promise<BalanceData> {
  const tokens = TOKEN_ADDRESSES[chainId as keyof typeof TOKEN_ADDRESSES];

  const balancePromises: Promise<bigint>[] = [fetchEthBalance(client, walletAddress)];

  const tokenKeys = Object.keys(tokens) as Array<keyof typeof tokens>;
  tokenKeys.forEach((key) => {
    balancePromises.push(fetchTokenBalance(client, tokens[key], walletAddress));
  });

  const rawBalances = await Promise.all(balancePromises);

  const ethRaw = rawBalances[0];
  const tokenBalances = rawBalances.slice(1);

  const eth = formatBalance(ethRaw, 18);
  const ethUsd = calculateUsdValue(eth, getTokenPrice("ETH"));

  const balanceData: BalanceData = {
    eth,
    ethUsd,
    wbtc: "0",
    wbtcUsd: 0,
    usdc: "0",
    usdcUsd: 0,
    totalUsd: ethUsd,
  };

  tokenKeys.forEach((key, index) => {
    const lowerKey = key.toString();
    const decimals = TOKEN_DECIMALS[lowerKey] || 18;
    const formatted = formatBalance(tokenBalances[index], decimals);
    const usdValue = calculateUsdValue(formatted, getTokenPrice(lowerKey));

    if (lowerKey === "WSTETH") {
      balanceData.wsteth = formatted;
      balanceData.wstethUsd = usdValue;
    } else if (lowerKey === "WETH") {
      balanceData.weth = formatted;
      balanceData.wethUsd = usdValue;
    } else if (lowerKey === "WBTC") {
      balanceData.wbtc = formatted;
      balanceData.wbtcUsd = usdValue;
    } else if (lowerKey === "CBBTC") {
      balanceData.cbbtc = formatted;
      balanceData.cbbtcUsd = usdValue;
    } else if (lowerKey === "USDC") {
      balanceData.usdc = formatted;
      balanceData.usdcUsd = usdValue;
    } else if (lowerKey === "USDT") {
      balanceData.usdt = formatted;
      balanceData.usdtUsd = usdValue;
    }

    balanceData.totalUsd += usdValue;
  });

  return balanceData;
}

async function fetchOnChainPositions(
  client: PublicClient,
  walletAddress: Address,
  chainId: number
): Promise<PositionInfo> {
  const positionManager =
    POSITION_MANAGER_ADDRESSES[chainId as keyof typeof POSITION_MANAGER_ADDRESSES];

  if (!positionManager) {
    return { tokenIds: [], count: 0 };
  }

  const count = await fetchPositionCount(client, positionManager, walletAddress);
  const tokenIds = await fetchPositionTokenIds(client, positionManager, walletAddress, count);

  // TODO: Fetch inRange/needsRebalance from Position Manager state
  return {
    tokenIds,
    count,
    inRange: undefined,
    needsRebalance: undefined,
  };
}

function convertApiToBalanceData(apiData: PositionData): BalanceData {
  const balances = apiData.balances;

  const parseBalance = (token?: { formatted: string; usd: string }) => ({
    formatted: token?.formatted || "0",
    usd: parseFloat(token?.usd || "0"),
  });

  const eth = parseBalance(balances.eth);
  const wsteth = parseBalance(balances.wsteth);
  const wbtc = parseBalance(balances.wbtc);
  const cbbtc = parseBalance(balances.cbbtc);
  const usdc = parseBalance(balances.usdc);

  const totalUsd = eth.usd + wsteth.usd + wbtc.usd + cbbtc.usd + usdc.usd;

  return {
    eth: eth.formatted,
    ethUsd: eth.usd,
    wsteth: wsteth.formatted,
    wstethUsd: wsteth.usd,
    wbtc: wbtc.formatted,
    wbtcUsd: wbtc.usd,
    cbbtc: cbbtc.formatted,
    cbbtcUsd: cbbtc.usd,
    usdc: usdc.formatted,
    usdcUsd: usdc.usd,
    totalUsd,
  };
}

function convertApiToPositionInfo(apiData: PositionData): PositionInfo {
  return {
    tokenIds: [],
    count: 0,
    inRange: apiData.position.inRange,
    needsRebalance: apiData.position.needsRebalance,
  };
}

export function usePositionData(
  smartAccount: Address | null,
  options?: UsePositionDataOptions
): WalletData & { refresh: () => void } {
  const {
    chainId = arbitrum.id,
    useApi = false,
    refreshInterval = DEFAULT_REFRESH_INTERVAL_MS,
  } = options ?? {};

  const [balances, setBalances] = useState<BalanceData | null>(null);
  const [positions, setPositions] = useState<PositionInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    if (!smartAccount) {
      setBalances(null);
      setPositions(null);
      setError(null);
      setLastUpdated(null);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      if (useApi) {
        console.log("[usePositionData] Fetching from API for:", smartAccount);

        const response = await api.getPosition(smartAccount);

        if (!isMountedRef.current) return;

        if (isSuccess(response)) {
          setBalances(convertApiToBalanceData(response.data));
          setPositions(convertApiToPositionInfo(response.data));
          setLastUpdated(Date.now());
        } else {
          throw new Error(response.error.message);
        }
      } else {
        console.log(
          "[usePositionData] Fetching on-chain data for:",
          smartAccount,
          "on chain:",
          chainId
        );

        const client = getPublicClient(chainId);

        const [fetchedBalances, fetchedPositions] = await Promise.all([
          fetchOnChainBalances(client, smartAccount, chainId),
          fetchOnChainPositions(client, smartAccount, chainId),
        ]);

        if (!isMountedRef.current) return;

        setBalances(fetchedBalances);
        setPositions(fetchedPositions);
        setLastUpdated(Date.now());
      }
    } catch (err) {
      if (!isMountedRef.current) return;

      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      const errorMessage = err instanceof Error ? err.message : "Failed to fetch position data";
      console.error("[usePositionData] Error:", errorMessage);
      setError(errorMessage);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [smartAccount, chainId, useApi]);

  const refresh = useCallback(() => {
    console.log("[usePositionData] Manual refresh triggered");
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    isMountedRef.current = true;

    fetchData();

    if (refreshInterval > 0 && smartAccount) {
      intervalRef.current = setInterval(() => {
        console.log("[usePositionData] Auto-refresh triggered");
        fetchData();
      }, refreshInterval);
    }

    return () => {
      isMountedRef.current = false;

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [fetchData, refreshInterval, smartAccount]);

  useEffect(() => {
    if (!smartAccount) {
      setBalances(null);
      setPositions(null);
      setError(null);
      setLastUpdated(null);
    }
  }, [smartAccount]);

  return {
    balances,
    positions,
    loading,
    error,
    lastUpdated,
    refresh,
  };
}

export { getTokenPrice, formatBalance, calculateUsdValue };
