/**
 * POST /api/build
 *
 * Builds calldata for Uniswap V4 actions.
 * Agent signs and submits
 */

import { Context } from "hono";
import { Address, Hex } from "viem";
import { generateReceipt } from "../middleware/x402";
import {
  buildMintAction,
  buildCollectAction,
  buildWithdrawAction,
  buildApproveAction,
  buildDistributeAction,
  type Call,
} from "../lib/calldataBuilder";

const CHAIN_ID = 8453;

interface BuildRequest {
  user: Address;
  actions: Action[];
}

interface Action {
  type: "mint" | "deposit" | "withdraw" | "collect" | "compound" | "approve" | "distribute";
  params?: Record<string, unknown>;
}

interface Transaction {
  to: Address;
  data: Hex;
  value: string;
  description: string;
}

function callToTransaction(call: Call, description: string): Transaction {
  return {
    to: call.to,
    data: call.data,
    value: call.value.toString(),
    description,
  };
}

export async function buildHandler(c: Context): Promise<Response> {
  try {
    const body = (await c.req.json()) as BuildRequest;

    if (!body.user?.startsWith("0x")) {
      return c.json({ success: false, error: "Invalid user address", code: "INVALID_USER" }, 400);
    }
    if (!body.actions?.length) {
      return c.json({ success: false, error: "Actions required", code: "NO_ACTIONS" }, 400);
    }

    const txs: Transaction[] = [];

    for (const action of body.actions) {
      const params = action.params ?? {};

      switch (action.type) {
        case "mint":
        case "deposit":
        case "compound":
          txs.push(
            ...buildMintAction(body.user, params).map((c) => callToTransaction(c, `Mint LP action`))
          );
          break;
        case "collect":
          txs.push(
            ...buildCollectAction(body.user, params).map((c) =>
              callToTransaction(c, `Collect fees #${params.tokenId ?? "?"}`)
            )
          );
          break;
        case "withdraw":
          txs.push(
            ...buildWithdrawAction(body.user, params).map((c) =>
              callToTransaction(
                c,
                `Withdraw ${params.percentage ?? 100}% from #${params.tokenId ?? "?"}`
              )
            )
          );
          break;
        case "approve":
          txs.push(
            ...buildApproveAction(params).map((c) =>
              callToTransaction(c, `Approve ${(params.token as string)?.slice(0, 8) ?? "token"}...`)
            )
          );
          break;
        case "distribute":
          txs.push(
            ...buildDistributeAction(params).map((c) =>
              callToTransaction(
                c,
                `Transfer to ${(params.destination as string)?.slice(0, 8) ?? "?"}...`
              )
            )
          );
          break;
        default:
          return c.json(
            { success: false, error: `Unknown action: ${action.type}`, code: "UNKNOWN_ACTION" },
            400
          );
      }
    }

    return c.json({
      success: true,
      chainId: CHAIN_ID,
      transactions: txs,
      estimatedGas: String(100000 + txs.length * 80000),
      receipt: generateReceipt(
        c.get("paymentId"),
        "/api/build",
        0.01,
        body.actions.map((a) => a.type)
      ),
    });
  } catch (error: unknown) {
    console.error("[build]", error);
    return c.json({ success: false, error: "Internal error", code: "INTERNAL_ERROR" }, 500);
  }
}
