/**
 * API client for the agent.
 */

import type { Address, Hex } from "viem";
import type { PositionSnapshot } from "./loop.js";

interface ApiTransaction {
  to: Address;
  data: Hex;
  value: string;
  description: string;
}

interface BuildResponse {
  success: boolean;
  chainId: number;
  transactions: ApiTransaction[];
  estimatedGas: string;
  error?: string;
}

interface PositionResponse {
  success: boolean;
  address: string;
  hasPosition: boolean;
  walletValueUsd: number;
  token0Balance: string;
  token1Balance: string;
  token0Address: string;
  token1Address: string;
  token0Decimals: number;
  token1Decimals: number;
  token0Symbol: string;
  token1Symbol: string;
  positionCount: number;
  token0PriceUsd?: number;
  token1PriceUsd?: number;
  /** @deprecated */
  btcPrice?: number;
  strategy?: {
    token0?: { address: string; symbol: string; decimals: number };
    token1?: { address: string; symbol: string; decimals: number };
  };
  error?: string;
}

export async function fetchPositionFromApi(
  apiBase: string,
  smartAccount: string,
  agentEns: string
): Promise<PositionSnapshot | null> {
  try {
    const encodedEns = encodeURIComponent(agentEns);
    const res = await fetch(`${apiBase}/api/position/${smartAccount}?agent=${encodedEns}`, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.error(`[apiClient] Position fetch failed: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as PositionResponse;
    const strategyToken0 = data.strategy?.token0;
    const strategyToken1 = data.strategy?.token1;

    return {
      hasPosition: data.hasPosition ?? false,
      walletValueUsd: data.walletValueUsd ?? 0,
      token0BalanceRaw: data.token0Balance ?? "0",
      token1BalanceRaw: data.token1Balance ?? "0",
      token0Address: strategyToken0?.address ?? data.token0Address,
      token1Address: strategyToken1?.address ?? data.token1Address,
      token0Decimals: strategyToken0?.decimals ?? data.token0Decimals ?? 18,
      token1Decimals: strategyToken1?.decimals ?? data.token1Decimals ?? 18,
      token0Symbol: strategyToken0?.symbol ?? data.token0Symbol ?? "TOKEN0",
      token1Symbol: strategyToken1?.symbol ?? data.token1Symbol ?? "TOKEN1",
      positionCount: data.positionCount ?? 0,
      token0PriceUsd: data.token0PriceUsd ?? 0,
      token1PriceUsd: data.token1PriceUsd ?? 1,
      btcPrice: data.btcPrice ?? data.token0PriceUsd ?? 0,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[apiClient] Position fetch error:", message);
    return null;
  }
}

export async function requestCalldata(
  apiBase: string,
  request: {
    user: string;
    agentEns: string;
    actions: Array<{ type: string; params?: Record<string, unknown> }>;
  }
): Promise<BuildResponse | null> {
  try {
    const res = await fetch(`${apiBase}/api/build`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      console.error(`[apiClient] Build calldata failed: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as BuildResponse;
    if (!data.success) {
      console.error(`[apiClient] Build error: ${data.error}`);
      return null;
    }

    return data;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[apiClient] Build calldata error:", message);
    return null;
  }
}
