/**
 * LiFi integration for cross-chain swaps.
 *
 * REST wrapper for the LiFi quote API.
 * Used for cross-chain distributions when destinationChain differs from Base.
 *
 * Note: LiFi router is NOT in session key permissions.
 * Can only be used via agent EOA for its own funds,
 * or session key permissions must be extended.
 */

import type { Address, Hex } from "viem";

const LIFI_API = "https://li.quest/v1";
const LIFI_API_KEY = process.env.LIFI_API_KEY || "";

interface SwapQuote {
  fromChainId: number;
  toChainId: number;
  fromToken: Address;
  toToken: Address;
  fromAmount: string;
  toAmount: string;
  estimatedGas: string;
  toolUsed: string;
}

interface SwapCalldata {
  to: Address;
  data: Hex;
  value: string;
  gasLimit: string;
}

export async function getSwapQuote(params: {
  fromChainId: number;
  toChainId: number;
  fromToken: Address;
  toToken: Address;
  fromAmount: string;
  fromAddress: Address;
}): Promise<SwapQuote | null> {
  try {
    const query = new URLSearchParams({
      fromChain: params.fromChainId.toString(),
      toChain: params.toChainId.toString(),
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
    });

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (LIFI_API_KEY) {
      headers["x-lifi-api-key"] = LIFI_API_KEY;
    }

    const res = await fetch(`${LIFI_API}/quote?${query}`, { headers });

    if (!res.ok) {
      console.error(`[lifi] Quote failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();

    return {
      fromChainId: params.fromChainId,
      toChainId: params.toChainId,
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      toAmount: data.estimate?.toAmount ?? "0",
      estimatedGas: data.estimate?.gasCosts?.[0]?.amount ?? "0",
      toolUsed: data.toolDetails?.name ?? "unknown",
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[lifi] Quote error:", message);
    return null;
  }
}

export async function buildSwapCalldata(params: {
  fromChainId: number;
  toChainId: number;
  fromToken: Address;
  toToken: Address;
  fromAmount: string;
  fromAddress: Address;
  toAddress: Address;
  slippage?: number;
}): Promise<SwapCalldata | null> {
  try {
    const query = new URLSearchParams({
      fromChain: params.fromChainId.toString(),
      toChain: params.toChainId.toString(),
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
      toAddress: params.toAddress,
      slippage: (params.slippage ?? 0.5).toString(),
    });

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (LIFI_API_KEY) {
      headers["x-lifi-api-key"] = LIFI_API_KEY;
    }

    const res = await fetch(`${LIFI_API}/quote?${query}`, { headers });

    if (!res.ok) {
      console.error(`[lifi] Calldata build failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    const tx = data.transactionRequest;

    if (!tx) {
      console.error("[lifi] No transaction request in response");
      return null;
    }

    return {
      to: tx.to as Address,
      data: tx.data as Hex,
      value: tx.value ?? "0",
      gasLimit: tx.gasLimit ?? "0",
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[lifi] Calldata error:", message);
    return null;
  }
}
