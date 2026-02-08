/**
 * POST /api/build
 *
 * Builds calldata for DeFi actions.
 */

import { Context } from "hono";
import { Address, Hex } from "viem";
import { generateReceipt } from "../middleware/x402";
import {
  buildMintAction,
  buildMintFromDeltasAction,
  buildIncreaseLiquidityAction,
  buildCollectAction,
  buildWithdrawAction,
  buildApproveAction,
  buildDistributeAction,
  type Call,
} from "../lib/calldataBuilder";
import {
  buildSwapCalldata,
  getSwapCalldata,
  getBridgeCalldata,
  getComposerDepositCalldata,
} from "../lib/lifi";
import { resolveAgentENS, resolveStrategyConfig } from "../lib/ens";

interface BuildRequest {
  user: Address;
  agentEns: string;
  actions: Action[];
}

interface Action {
  type:
    | "mint"
    | "deposit"
    | "withdraw"
    | "collect"
    | "compound"
    | "approve"
    | "distribute"
    | "rebalance"
    | "lifi-swap"
    | "swap"
    | "mint-from-deltas"
    | "increase-liquidity"
    | "composer-deposit"
    | "bridge";
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
    if (!body.agentEns) {
      return c.json({ success: false, error: "agentEns required", code: "MISSING_AGENT_ENS" }, 400);
    }
    if (!body.actions?.length) {
      return c.json({ success: false, error: "Actions required", code: "NO_ACTIONS" }, 400);
    }

    const ensConfig = await resolveAgentENS(body.agentEns);
    const strategy = resolveStrategyConfig(ensConfig);
    if (!strategy) {
      return c.json(
        { success: false, error: "Could not resolve strategy from ENS", code: "INVALID_STRATEGY" },
        400
      );
    }

    const txs: Transaction[] = [];

    for (const action of body.actions) {
      const params = action.params ?? {};

      switch (action.type) {
        case "mint":
        case "deposit":
        case "compound":
          txs.push(
            ...buildMintAction(body.user, params, strategy).map((call) =>
              callToTransaction(call, "Mint LP action")
            )
          );
          break;

        case "collect":
          txs.push(
            ...buildCollectAction(body.user, params, strategy).map((call) =>
              callToTransaction(call, `Collect fees #${params.tokenId ?? "?"}`)
            )
          );
          break;

        case "withdraw":
          txs.push(
            ...buildWithdrawAction(body.user, params, strategy).map((call) =>
              callToTransaction(
                call,
                `Withdraw ${params.percentage ?? 100}% from #${params.tokenId ?? "?"}`
              )
            )
          );
          break;

        case "approve":
          txs.push(
            ...buildApproveAction(params).map((call) =>
              callToTransaction(
                call,
                `Approve ${(params.token as string)?.slice(0, 8) ?? "token"}...`
              )
            )
          );
          break;

        case "distribute":
          txs.push(
            ...buildDistributeAction(params).map((call) =>
              callToTransaction(
                call,
                `Transfer to ${(params.destination as string)?.slice(0, 8) ?? "?"}...`
              )
            )
          );
          break;

        case "rebalance": {
          const fromToken = (params.fromToken as Address) ?? strategy.token0;
          const toToken = (params.toToken as Address) ?? strategy.token1;
          const swap = await buildSwapCalldata({
            fromChainId: strategy.chainId,
            toChainId: ((params.toChainId as number) ?? strategy.chainId) as number,
            fromToken,
            toToken,
            fromAmount: ((params.fromAmount as string) ?? "0") as string,
            fromAddress: body.user,
            toAddress: ((params.toAddress as Address) ?? body.user) as Address,
            slippage: params.slippage as number | undefined,
          });
          if (!swap) {
            return c.json(
              { success: false, error: "Failed to build rebalance swap", code: "REBALANCE_FAILED" },
              400
            );
          }
          txs.push({
            to: swap.to,
            data: swap.data,
            value: swap.value,
            description: `Rebalance ${fromToken.slice(0, 8)} -> ${toToken.slice(0, 8)}`,
          });
          break;
        }

        case "lifi-swap":
        case "swap": {
          const chainId = (params.chainId as number) ?? strategy.chainId;
          const fromToken = params.fromToken as Address;
          const fromAmount = params.fromAmount as string;
          let toToken = params.toToken as Address | undefined;
          
          if (!toToken) {
            const usdcAddresses = [
              "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".toLowerCase(),
              "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913".toLowerCase(),
              "0xaf88d065e77c8cC2239327C5EDb3A432268e5831".toLowerCase(),
            ];
            if (usdcAddresses.includes(fromToken?.toLowerCase())) {
              toToken = strategy.token0;
            } else if (fromToken?.toLowerCase() === strategy.token0.toLowerCase()) {
              toToken = strategy.token1;
            } else {
              toToken = strategy.token0;
            }
          }
          
          if (!fromToken || !fromAmount) {
            return c.json(
              {
                success: false,
                error: "fromToken and fromAmount required",
                code: "MISSING_SWAP_PARAMS",
              },
              400
            );
          }
          const result = await getSwapCalldata({
            chainId,
            fromToken,
            toToken,
            fromAmount,
            fromAddress: body.user,
            toAddress: params.toAddress as Address | undefined,
            slippage: params.slippage as number | undefined,
          });
          if (!result) {
            return c.json(
              { success: false, error: "LI.FI swap quote failed", code: "LIFI_FAILED" },
              400
            );
          }
          txs.push(...result.transactions.map((t) => ({ ...t, description: t.description })));
          break;
        }

        case "mint-from-deltas":
          txs.push(
            ...buildMintFromDeltasAction(body.user, params, strategy).map((call) =>
              callToTransaction(call, "Mint LP action from deltas")
            )
          );
          break;

        case "increase-liquidity":
          txs.push(
            ...buildIncreaseLiquidityAction(body.user, params, strategy).map((call) =>
              callToTransaction(call, `Increase liquidity #${params.tokenId ?? "?"}`)
            )
          );
          break;

        case "composer-deposit": {
          const chainId = (params.chainId as number) ?? strategy.chainId;
          const fromToken = params.fromToken as Address;
          const vaultToken = params.vaultToken as Address;
          const fromAmount = params.fromAmount as string;
          if (!fromToken || !vaultToken || !fromAmount) {
            return c.json(
              {
                success: false,
                error: "fromToken, vaultToken, fromAmount required",
                code: "MISSING_COMPOSER_PARAMS",
              },
              400
            );
          }
          const result = await getComposerDepositCalldata({
            chainId,
            fromToken,
            vaultToken,
            fromAmount,
            fromAddress: body.user,
            crossChainFromChainId: params.crossChainFromChainId as number | undefined,
          });
          if (!result) {
            return c.json(
              {
                success: false,
                error: "LI.FI Composer quote failed",
                code: "LIFI_COMPOSER_FAILED",
              },
              400
            );
          }
          txs.push(...result.transactions.map((t) => ({ ...t, description: t.description })));
          break;
        }

        case "bridge": {
          const fromChainId = (params.fromChainId as number) ?? strategy.chainId;
          const toChainId = params.toChainId as number;
          const fromToken = params.fromToken as Address;
          const toToken = params.toToken as Address;
          const fromAmount = params.fromAmount as string;
          const toAddress = (params.toAddress as Address) ?? body.user;
          if (!toChainId || !fromToken || !toToken || !fromAmount || !toAddress) {
            return c.json(
              {
                success: false,
                error: "fromChainId/toChainId, fromToken, toToken, fromAmount, toAddress required",
                code: "MISSING_BRIDGE_PARAMS",
              },
              400
            );
          }
          const result = await getBridgeCalldata({
            fromChainId,
            toChainId,
            fromToken,
            toToken,
            fromAmount,
            fromAddress: body.user,
            toAddress,
          });
          if (!result) {
            return c.json(
              { success: false, error: "LI.FI bridge quote failed", code: "LIFI_FAILED" },
              400
            );
          }
          txs.push(...result.transactions.map((t) => ({ ...t, description: t.description })));
          break;
        }

        default:
          return c.json(
            { success: false, error: `Unknown action: ${action.type}`, code: "UNKNOWN_ACTION" },
            400
          );
      }
    }

    return c.json({
      success: true,
      chainId: strategy.chainId,
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
