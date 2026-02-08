/**
 * LI.FI integration for DeFi transaction composition.
 *
 * Supports:
 * - Same-chain swaps via /v1/quote REST API
 * - Cross-chain bridges via /v1/quote REST API
 * - Composed transactions (swap+deposit) via Composer (toToken=vault)
 */

import type { Address, Hex } from "viem";
import { encodeFunctionData } from "viem";

const LIFI_API = "https://li.quest/v1";
const LIFI_API_KEY = process.env.LIFI_API_KEY || "";

export interface LiFiTransaction {
  to: Address;
  data: Hex;
  value: string;
  description: string;
}

export interface LiFiQuoteResult {
  id: string;
  toolUsed: string;
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  transactions: LiFiTransaction[];
}

const ERC20_APPROVE_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (LIFI_API_KEY) {
    headers["x-lifi-api-key"] = LIFI_API_KEY;
  }
  return headers;
}

/**
 * Get a quote from LI.FI for a swap or bridge.
 * Returns ready-to-execute transaction calldata.
 */
async function fetchLiFiQuote(params: {
  fromChain: number;
  toChain: number;
  fromToken: Address;
  toToken: Address;
  fromAmount: string;
  fromAddress: Address;
  toAddress?: Address;
  slippage?: number;
}): Promise<{
  id: string;
  tool: string;
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  approvalAddress: Address | null;
  tx: { to: Address; data: Hex; value: string; gasLimit: string; chainId: number } | null;
} | null> {
  try {
    const query = new URLSearchParams({
      fromChain: params.fromChain.toString(),
      toChain: params.toChain.toString(),
      fromToken: params.fromToken,
      toToken: params.toToken,
      fromAmount: params.fromAmount,
      fromAddress: params.fromAddress,
      ...(params.toAddress ? { toAddress: params.toAddress } : {}),
      slippage: (params.slippage ?? 0.005).toString(),
    });

    const res = await fetch(`${LIFI_API}/quote?${query}`, {
      headers: getHeaders(),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[lifi] Quote failed: ${res.status}`, body.slice(0, 300));
      return null;
    }

    const data = await res.json();
    const txReq = data.transactionRequest;

    return {
      id: data.id ?? "",
      tool: data.toolDetails?.name ?? data.tool ?? "unknown",
      fromAmount: data.action?.fromAmount ?? params.fromAmount,
      toAmount: data.estimate?.toAmount ?? "0",
      toAmountMin: data.estimate?.toAmountMin ?? "0",
      approvalAddress: (data.estimate?.approvalAddress as Address) ?? null,
      tx: txReq
        ? {
            to: txReq.to as Address,
            data: txReq.data as Hex,
            value: txReq.value ?? "0",
            gasLimit: txReq.gasLimit ?? "500000",
            chainId: txReq.chainId ?? params.fromChain,
          }
        : null,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[lifi] Quote error:", message);
    return null;
  }
}

/**
 * Build a same-chain swap via LI.FI.
 * Returns array of calls: [approve (if ERC20), swap]
 *
 * This is the core swap function used by the agent.
 * The user deposits USDC and this swaps it to the needed tokens.
 */
export async function getSwapCalldata(params: {
  chainId: number;
  fromToken: Address;
  toToken: Address;
  fromAmount: string;
  fromAddress: Address;
  toAddress?: Address;
  slippage?: number;
}): Promise<LiFiQuoteResult | null> {
  const quote = await fetchLiFiQuote({
    fromChain: params.chainId,
    toChain: params.chainId,
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
    toAddress: params.toAddress,
    slippage: params.slippage,
  });

  if (!quote?.tx) {
    console.error("[lifi] No transaction in swap quote");
    return null;
  }

  const transactions: LiFiTransaction[] = [];

  const isNativeFrom = params.fromToken === "0x0000000000000000000000000000000000000000";
  if (!isNativeFrom && quote.approvalAddress) {
    transactions.push({
      to: params.fromToken,
      data: encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [quote.approvalAddress, BigInt(params.fromAmount)],
      }),
      value: "0",
      description: `Approve ${params.fromToken.slice(0, 10)}... for LI.FI router`,
    });
  }

  transactions.push({
    to: quote.tx.to,
    data: quote.tx.data,
    value: quote.tx.value,
    description: `Swap via ${quote.tool}`,
  });

  return {
    id: quote.id,
    toolUsed: quote.tool,
    fromAmount: quote.fromAmount,
    toAmount: quote.toAmount,
    toAmountMin: quote.toAmountMin,
    transactions,
  };
}

/**
 * Build a cross-chain bridge via LI.FI.
 * Used for yield distribution (e.g., Base -> Gnosis for Gnosis Pay).
 */
export async function getBridgeCalldata(params: {
  fromChainId: number;
  toChainId: number;
  fromToken: Address;
  toToken: Address;
  fromAmount: string;
  fromAddress: Address;
  toAddress: Address;
}): Promise<LiFiQuoteResult | null> {
  const quote = await fetchLiFiQuote({
    fromChain: params.fromChainId,
    toChain: params.toChainId,
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
    toAddress: params.toAddress,
    slippage: 0.01,
  });

  if (!quote?.tx) {
    console.error("[lifi] No transaction in bridge quote");
    return null;
  }

  const transactions: LiFiTransaction[] = [];

  const isNativeFrom = params.fromToken === "0x0000000000000000000000000000000000000000";
  if (!isNativeFrom && quote.approvalAddress) {
    transactions.push({
      to: params.fromToken,
      data: encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [quote.approvalAddress, BigInt(params.fromAmount)],
      }),
      value: "0",
      description: "Approve for bridge",
    });
  }

  transactions.push({
    to: quote.tx.to,
    data: quote.tx.data,
    value: quote.tx.value,
    description: `Bridge via ${quote.tool} (chain ${params.fromChainId} -> ${params.toChainId})`,
  });

  return {
    id: quote.id,
    toolUsed: quote.tool,
    fromAmount: quote.fromAmount,
    toAmount: quote.toAmount,
    toAmountMin: quote.toAmountMin,
    transactions,
  };
}

/**
 * Build a deposit into a Composer-supported vault via LI.FI.
 * The toToken should be the vault token address.
 * LI.FI automatically detects Composer-supported protocols and bundles
 * the swap + deposit into a single transaction.
 *
 * Supported: Morpho, Aave V3, Euler, Pendle, etc.
 * See: https://docs.li.fi/introduction/user-flows-and-examples/lifi-composer
 */
export async function getComposerDepositCalldata(params: {
  chainId: number;
  fromToken: Address;
  vaultToken: Address;
  fromAmount: string;
  fromAddress: Address;
  crossChainFromChainId?: number;
}): Promise<LiFiQuoteResult | null> {
  const fromChain = params.crossChainFromChainId ?? params.chainId;

  const quote = await fetchLiFiQuote({
    fromChain,
    toChain: params.chainId,
    fromToken: params.fromToken,
    toToken: params.vaultToken,
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
    slippage: 0.005,
  });

  if (!quote?.tx) {
    console.error("[lifi] No transaction in Composer deposit quote");
    return null;
  }

  const transactions: LiFiTransaction[] = [];

  const isNativeFrom = params.fromToken === "0x0000000000000000000000000000000000000000";
  if (!isNativeFrom && quote.approvalAddress) {
    transactions.push({
      to: params.fromToken,
      data: encodeFunctionData({
        abi: ERC20_APPROVE_ABI,
        functionName: "approve",
        args: [quote.approvalAddress, BigInt(params.fromAmount)],
      }),
      value: "0",
      description: "Approve for Composer deposit",
    });
  }

  transactions.push({
    to: quote.tx.to,
    data: quote.tx.data,
    value: quote.tx.value,
    description: `Composer deposit via ${quote.tool}`,
  });

  return {
    id: quote.id,
    toolUsed: quote.tool,
    fromAmount: quote.fromAmount,
    toAmount: quote.toAmount,
    toAmountMin: quote.toAmountMin,
    transactions,
  };
}

export async function getDepositCalldata(params: {
  chainId: number;
  fromToken: Address;
  vaultToken: Address;
  fromAmount: string;
  fromAddress: Address;
  crossChainFromChainId?: number;
}): Promise<LiFiQuoteResult | null> {
  return getComposerDepositCalldata(params);
}

export { fetchLiFiQuote as getLiFiQuote };

export async function buildSwapCalldata(params: {
  fromChainId: number;
  toChainId: number;
  fromToken: Address;
  toToken: Address;
  fromAmount: string;
  fromAddress: Address;
  toAddress: Address;
  slippage?: number;
}): Promise<{ to: Address; data: Hex; value: string; gasLimit: string } | null> {
  const quote = await fetchLiFiQuote({
    fromChain: params.fromChainId,
    toChain: params.toChainId,
    fromToken: params.fromToken,
    toToken: params.toToken,
    fromAmount: params.fromAmount,
    fromAddress: params.fromAddress,
    toAddress: params.toAddress,
    slippage: params.slippage,
  });
  if (!quote?.tx) return null;
  return {
    to: quote.tx.to,
    data: quote.tx.data,
    value: quote.tx.value,
    gasLimit: quote.tx.gasLimit,
  };
}
