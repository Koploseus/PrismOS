/**
 * GET /api/transactions/:address
 *
 * Transaction history via Zerion API.
 * Query params: ?chain=ethereum&limit=20
 */

import { Context } from "hono";
import { isAddress } from "viem";
import * as zerion from "../lib/zerion.js";

export interface TransactionSummary {
  id: string;
  hash: string;
  type: string;
  status: "confirmed" | "failed" | "pending";
  timestamp: string;
  chain: string;
  fee: { valueUsd: number | null; symbol: string };
  transfers: Array<{
    direction: "in" | "out" | "self";
    symbol: string;
    amount: number;
    valueUsd: number | null;
  }>;
  nftTransfers: Array<{
    direction: "in" | "out" | "self";
    name: string;
    tokenId?: string;
  }>;
  protocol?: string;
}

function mapTransaction(tx: zerion.ZerionTransaction): TransactionSummary {
  const a = tx.attributes;
  return {
    id: tx.id,
    hash: a.hash,
    type: a.operation_type,
    status: a.status,
    timestamp: a.mined_at,
    chain: tx.relationships.chain.data.id,
    fee: {
      valueUsd: a.fee.value,
      symbol: a.fee.fungible_info.symbol,
    },
    transfers: a.transfers
      .filter((t) => t.fungible_info)
      .map((t) => ({
        direction: t.direction,
        symbol: t.fungible_info!.symbol,
        amount: t.quantity.float,
        valueUsd: t.value,
      })),
    nftTransfers: a.transfers
      .filter((t) => t.nft_info)
      .map((t) => ({
        direction: t.direction,
        name: t.nft_info!.name,
      })),
    protocol: a.application_metadata?.name,
  };
}

export async function transactionsHandler(c: Context): Promise<Response> {
  try {
    const address = c.req.param("address");
    if (!address || !isAddress(address)) {
      return c.json({ success: false, error: "Invalid address" }, 400);
    }

    const chainParam = c.req.query("chain"); // "ethereum", "arbitrum", etc.
    const limitParam = c.req.query("limit");
    const pageSize = Math.min(parseInt(limitParam || "20", 10) || 20, 100);

    const data = await zerion.getTransactions(address, {
      chainId: chainParam || undefined,
      pageSize,
    });

    if (!data) {
      return c.json({ success: false, error: "Zerion unavailable" }, 503);
    }

    const transactions = data.data
      .filter((tx) => !tx.attributes.flags?.is_trash)
      .map(mapTransaction);

    return c.json({
      success: true,
      address,
      transactions,
      count: transactions.length,
      timestamp: Date.now(),
    });
  } catch (error: unknown) {
    console.error("[transactions]", error);
    return c.json({ success: false, error: "Internal error" }, 500);
  }
}
