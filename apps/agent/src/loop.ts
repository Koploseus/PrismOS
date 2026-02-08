/**
 * Agent loop.
 */

import { formatUnits } from "viem";
import { loadSubscriptions, updateSubscription, type AgentSubscription } from "./store.js";
import { fetchPositionFromApi, requestCalldata } from "./apiClient.js";
import { executeViaSessionKey } from "./executor.js";
import { getAgentDecisions, type AgentContext, type AgentDecision } from "./brain.js";
import { fetchMarketData, type MarketData } from "./market.js";

const MAX_CONSECUTIVE_ERRORS = 3;
const errorCounters = new Map<string, number>();

interface LoopConfig {
  agentEns: string;
  apiBase: string;
}

export async function startAgent(config: LoopConfig): Promise<void> {
  console.log("[loop] Starting agent loop");
  const startTime = Date.now();

  const subscriptions = loadSubscriptions().filter((sub) => sub.status === "active");
  if (subscriptions.length === 0) {
    console.log("[loop] No active subscriptions, skipping");
    return;
  }

  console.log(`[loop] Processing ${subscriptions.length} active subscription(s)`);
  const marketData = await fetchMarketData();

  for (const sub of subscriptions) {
    try {
      await processSubscription(sub, marketData, config);
      errorCounters.set(sub.smartAccount.toLowerCase(), 0);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[loop] Error processing ${sub.smartAccount}:`, message);

      const key = sub.smartAccount.toLowerCase();
      const count = (errorCounters.get(key) ?? 0) + 1;
      errorCounters.set(key, count);

      if (count >= MAX_CONSECUTIVE_ERRORS) {
        console.error(`[loop] ${sub.smartAccount} hit ${MAX_CONSECUTIVE_ERRORS} consecutive errors, pausing`);
        updateSubscription(sub.smartAccount, { status: "error" });
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[loop] Agent loop completed in ${elapsed}s`);
}

async function processSubscription(
  sub: AgentSubscription,
  marketData: MarketData,
  config: LoopConfig
): Promise<void> {
  const tag = `[loop:${sub.smartAccount.slice(0, 8)}]`;
  console.log(`${tag} Fetching position from API...`);

  const position = await fetchPositionFromApi(config.apiBase, sub.smartAccount, config.agentEns);
  if (!position) {
    console.log(`${tag} Could not fetch position, skipping`);
    return;
  }

  console.log(`${tag} Position: walletUsd=$${position.walletValueUsd.toFixed(2)}, hasLP=${position.hasPosition}`);

  const ctx: AgentContext = {
    position,
    marketData,
    subscription: sub,
    timestamp: Date.now(),
  };

  const agentResponse = await getAgentDecisions(ctx);
  console.log(
    `${tag} Agent (${agentResponse.source}): ${agentResponse.decisions.map((d) => d.action).join(" -> ")}`
  );

  for (const decision of agentResponse.decisions) {
    await executeDecision(sub, decision, position, marketData, config);
  }
}

async function executeDecision(
  sub: AgentSubscription,
  decision: AgentDecision,
  position: PositionSnapshot,
  marketData: MarketData,
  config: LoopConfig
): Promise<void> {
  const tag = `[loop:${sub.smartAccount.slice(0, 8)}]`;

  switch (decision.action) {
    case "collect": {
      const tokenId = (decision.params.tokenId as string) || sub.positionTokenId;
      if (!tokenId || !position.hasPosition) {
        console.log(`${tag} No position/tokenId for collect, skipping`);
        return;
      }

      const calldata = await requestCalldata(config.apiBase, {
        user: sub.smartAccount,
        agentEns: config.agentEns,
        actions: [{ type: "collect", params: { tokenId } }],
      });

      if (!calldata) {
        console.error(`${tag} Failed to get collect calldata from API`);
        return;
      }

      const result = await executeViaSessionKey(sub, calldata.transactions);
      if (result.success) {
        console.log(`${tag} Collect tx: ${result.txHash}`);
        updateSubscription(sub.smartAccount, { lastActionAt: Date.now() });
      } else {
        console.error(`${tag} Collect failed: ${result.error}`);
      }
      break;
    }

    case "compound": {
      const compoundPercent = (decision.params.percent as number) || sub.compoundPercent;
      if (compoundPercent <= 0) {
        return;
      }

      const token0Amt = Number(
        formatUnits(BigInt(position.token0BalanceRaw || "0"), position.token0Decimals)
      );
      const token1Amt = Number(
        formatUnits(BigInt(position.token1BalanceRaw || "0"), position.token1Decimals)
      );
      const totalUsd = (token0Amt + token1Amt) * marketData.btcPrice;

      if (totalUsd < 1) {
        console.log(`${tag} Balance too low to compound ($${totalUsd.toFixed(2)})`);
        return;
      }

      const compoundToken0 = (BigInt(position.token0BalanceRaw || "0") * BigInt(compoundPercent)) / 100n;
      const compoundToken1 = (BigInt(position.token1BalanceRaw || "0") * BigInt(compoundPercent)) / 100n;

      const calldata = await requestCalldata(config.apiBase, {
        user: sub.smartAccount,
        agentEns: config.agentEns,
        actions: [
          {
            type: "compound",
            params: { amount0: compoundToken0.toString(), amount1: compoundToken1.toString() },
          },
        ],
      });

      if (!calldata) {
        console.error(`${tag} Failed to get compound calldata`);
        return;
      }

      const result = await executeViaSessionKey(sub, calldata.transactions);
      if (result.success) {
        console.log(`${tag} Compound tx: ${result.txHash}`);
        updateSubscription(sub.smartAccount, { lastActionAt: Date.now() });
      }
      break;
    }

    case "distribute": {
      const distributePercent = (decision.params.percent as number) || sub.distributePercent;
      const destination = (decision.params.destination as string) || sub.distributionAddress;
      if (distributePercent <= 0 || !destination) {
        return;
      }

      const distributeToken0 =
        (BigInt(position.token0BalanceRaw || "0") * BigInt(distributePercent)) / 100n;
      const distributeToken1 =
        (BigInt(position.token1BalanceRaw || "0") * BigInt(distributePercent)) / 100n;

      const actions: Array<{ type: string; params: Record<string, unknown> }> = [];
      if (distributeToken0 > 0n) {
        actions.push({
          type: "distribute",
          params: {
            destination,
            token: position.token0Address,
            amount: distributeToken0.toString(),
          },
        });
      }
      if (distributeToken1 > 0n) {
        actions.push({
          type: "distribute",
          params: {
            destination,
            token: position.token1Address,
            amount: distributeToken1.toString(),
          },
        });
      }

      if (actions.length === 0) {
        return;
      }

      const calldata = await requestCalldata(config.apiBase, {
        user: sub.smartAccount,
        agentEns: config.agentEns,
        actions,
      });
      if (!calldata) {
        return;
      }

      const result = await executeViaSessionKey(sub, calldata.transactions);
      if (result.success) {
        console.log(`${tag} Distribution tx: ${result.txHash}`);
        updateSubscription(sub.smartAccount, { lastActionAt: Date.now() });
      }
      break;
    }

    case "rebalance":
      console.log(`${tag} Rebalance requested: ${decision.reason} (will implement with LI.FI in Phase 3)`);
      break;

    case "adjustRange":
      console.log(`${tag} Adjust range requested: ${decision.reason} (will implement in Phase 3)`);
      break;

    case "hold":
      console.log(`${tag} Holding: ${decision.reason}`);
      break;
  }
}

export interface PositionSnapshot {
  hasPosition: boolean;
  walletValueUsd: number;
  token0BalanceRaw: string;
  token1BalanceRaw: string;
  token0Address: string;
  token1Address: string;
  token0Decimals: number;
  token1Decimals: number;
  token0Symbol: string;
  token1Symbol: string;
  positionCount: number;
  btcPrice: number;
}
