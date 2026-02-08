/**
 * API client for the agent.
 *
 * Calls PrismOS API to:
 * - Fetch position data
 * - Request calldata for actions
 *
 * The agent never builds calldata itself — it asks the API.
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
  wbtcBalance: string;
  cbbtcBalance: string;
  positionCount: number;
  btcPrice: number;
  error?: string;
}

export async function fetchPositionFromApi(
  apiBase: string,
  smartAccount: string
): Promise<PositionSnapshot | null> {
  try {
    const res = await fetch(`${apiBase}/api/position/${smartAccount}`, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.error(`[apiClient] Position fetch failed: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as PositionResponse;

    return {
      hasPosition: data.hasPosition ?? false,
      walletValueUsd: data.walletValueUsd ?? 0,
      wbtcBalanceRaw: data.wbtcBalance ?? "0",
      cbbtcBalanceRaw: data.cbbtcBalance ?? "0",
      positionCount: data.positionCount ?? 0,
      btcPrice: data.btcPrice ?? 0,
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
