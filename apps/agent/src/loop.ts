/**
 * Agent loop.
 *
 * For each subscription this agent manages:
 * 1. Fetch position data from API
 * 2. Fetch market data
 * 3. Get AI agent decisions (or rule-based fallback)
 * 4. Request calldata from API
 * 5. Execute via session key
 */

import { Address, formatUnits } from "viem";
import { loadSubscriptions, updateSubscription, type AgentSubscription } from "./store.js";
import { fetchPositionFromApi, requestCalldata } from "./apiClient.js";
import { executeViaSessionKey, type ExecutionResult } from "./executor.js";
import { getAgentDecisions, type AgentContext, type AgentDecision, type AgentResponse } from "./brain.js";
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

  const subscriptions = loadSubscriptions().filter((s) => s.status === "active");

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

  // 1. Fetch position from API
  console.log(`${tag} Fetching position from API...`);
  const position = await fetchPositionFromApi(config.apiBase, sub.smartAccount);

  if (!position) {
    console.log(`${tag} Could not fetch position, skipping`);
    return;
  }

  console.log(`${tag} Position: walletUsd=$${position.walletValueUsd.toFixed(2)}, hasLP=${position.hasPosition}`);

  // 2. Build context for AI agent
  const ctx: AgentContext = {
    position,
    marketData,
    subscription: sub,
    timestamp: Date.now(),
  };

  // 3. Get AI decisions
  const agentResponse = await getAgentDecisions(ctx);
  console.log(`${tag} Agent (${agentResponse.source}): ${agentResponse.decisions.map((d) => d.action).join(" -> ")}`);

  // 4. Execute decisions
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

      console.log(`${tag} Collecting fees for token #${tokenId}`);

      // Request calldata from API
      const calldata = await requestCalldata(config.apiBase, {
        user: sub.smartAccount,
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
      if (compoundPercent <= 0) return;

      const wbtcAmt = Number(formatUnits(BigInt(position.wbtcBalanceRaw || "0"), 8));
      const cbbtcAmt = Number(formatUnits(BigInt(position.cbbtcBalanceRaw || "0"), 8));
      const totalUsd = (wbtcAmt + cbbtcAmt) * marketData.btcPrice;

      if (totalUsd < 1) {
        console.log(`${tag} Balance too low to compound ($${totalUsd.toFixed(2)})`);
        return;
      }

      const compoundWbtc = (BigInt(position.wbtcBalanceRaw || "0") * BigInt(compoundPercent)) / 100n;
      const compoundCbbtc = (BigInt(position.cbbtcBalanceRaw || "0") * BigInt(compoundPercent)) / 100n;

      console.log(`${tag} Compounding ${compoundPercent}%`);

      const calldata = await requestCalldata(config.apiBase, {
        user: sub.smartAccount,
        actions: [{ type: "compound", params: { amount0: compoundWbtc.toString(), amount1: compoundCbbtc.toString() } }],
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
      if (distributePercent <= 0 || !destination) return;

      console.log(`${tag} Distributing ${distributePercent}% to ${destination.slice(0, 8)}...`);

      const distributeWbtc = (BigInt(position.wbtcBalanceRaw || "0") * BigInt(distributePercent)) / 100n;
      const distributeCbbtc = (BigInt(position.cbbtcBalanceRaw || "0") * BigInt(distributePercent)) / 100n;

      const actions: Array<{ type: string; params: Record<string, unknown> }> = [];
      if (distributeWbtc > 0n) {
        actions.push({ type: "distribute", params: { destination, token: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c", amount: distributeWbtc.toString() } });
      }
      if (distributeCbbtc > 0n) {
        actions.push({ type: "distribute", params: { destination, token: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", amount: distributeCbbtc.toString() } });
      }

      if (actions.length === 0) return;

      const calldata = await requestCalldata(config.apiBase, { user: sub.smartAccount, actions });
      if (!calldata) return;

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

// Re-export the position type used in this file
export interface PositionSnapshot {
  hasPosition: boolean;
  walletValueUsd: number;
  wbtcBalanceRaw: string;
  cbbtcBalanceRaw: string;
  positionCount: number;
  btcPrice: number;
}
