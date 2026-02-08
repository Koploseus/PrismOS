/**
 * Hourly position loop.
 */

import { Address, formatUnits } from "viem";
import { readSubscriptions, upsertSubscription, type Subscription } from "../lib/subscriptions";
import { resolveAgentENS, resolveStrategyConfig, type AgentENSConfig } from "../lib/ens";
import { checkSmartAccountPosition, type PositionSnapshot } from "../lib/positionChecker";
import { executeViaSessionKey } from "../lib/executor";
import {
  buildCollectAction,
  buildDistributeAction,
  buildMintAction,
  type Call,
} from "../lib/calldataBuilder";
import { fetchMarketData, type MarketData } from "../lib/defillama";
import { getAgentDecisions, type AgentContext, type AgentDecision } from "../lib/agent";
import { trackFee, shouldSettle } from "./feeTracker";
import { runSettlement } from "./settlementLoop";
import type { StrategyConfig } from "../../../../packages/shared/src/types";

const MAX_CONSECUTIVE_ERRORS = 3;
const errorCounters = new Map<string, number>();

export async function positionLoop(): Promise<void> {
  console.log("[cron] Starting position loop");
  const startTime = Date.now();

  const data = readSubscriptions();
  const subscriptions = Object.values(data.subscriptions).filter((s) => s.status === "active");

  if (subscriptions.length === 0) {
    console.log("[cron] No active subscriptions, skipping");
    return;
  }

  console.log(`[cron] Processing ${subscriptions.length} active subscription(s)`);

  for (const sub of subscriptions) {
    try {
      await processSubscription(sub);
      errorCounters.set(sub.smartAccount.toLowerCase(), 0);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[cron] Error processing ${sub.smartAccount}:`, message);

      const key = sub.smartAccount.toLowerCase();
      const count = (errorCounters.get(key) ?? 0) + 1;
      errorCounters.set(key, count);

      if (count >= MAX_CONSECUTIVE_ERRORS) {
        console.error(
          `[cron] ${sub.smartAccount} hit ${MAX_CONSECUTIVE_ERRORS} consecutive errors, marking as error`
        );
        upsertSubscription(sub.smartAccount, { status: "error" });
      }
    }
  }

  if (shouldSettle()) {
    console.log("[cron] Fee threshold reached, triggering early settlement");
    await runSettlement();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[cron] Position loop completed in ${elapsed}s`);
}

async function processSubscription(sub: Subscription): Promise<void> {
  const tag = `[cron:${sub.smartAccount.slice(0, 8)}]`;

  console.log(`${tag} Resolving ENS: ${sub.agentEns}`);
  const agentConfig = await resolveAgentENS(sub.agentEns);
  const strategy = resolveStrategyConfig(agentConfig);
  if (!strategy) {
    throw new Error(`Invalid ENS strategy for ${sub.agentEns}`);
  }

  const marketData = await fetchMarketData(strategy);

  console.log(`${tag} Checking position...`);
  const position = await checkSmartAccountPosition(sub.smartAccount, strategy);

  console.log(
    `${tag} Position: hasLP=${position.hasPosition}, walletUsd=$${position.walletValueUsd.toFixed(2)}, positions=${position.positionCount}`
  );

  const ctx: AgentContext = {
    position,
    agentConfig,
    marketData,
    subscription: sub,
    timestamp: Date.now(),
  };

  const agentResponse = await getAgentDecisions(ctx);
  console.log(
    `${tag} Agent (${agentResponse.source}): ${agentResponse.decisions.map((d) => d.action).join(" -> ")}`
  );

  let currentPosition = position;
  for (const decision of agentResponse.decisions) {
    const result = await executeDecision(
      sub,
      decision,
      currentPosition,
      agentConfig,
      marketData,
      strategy
    );
    if (result.executed && ["collect", "compound", "distribute"].includes(decision.action)) {
      currentPosition = await checkSmartAccountPosition(sub.smartAccount, strategy);
    }
  }
}

interface ExecutionResult {
  executed: boolean;
  collectedUsd?: number;
  error?: string;
}

async function executeDecision(
  sub: Subscription,
  decision: AgentDecision,
  position: PositionSnapshot,
  agentConfig: AgentENSConfig,
  marketData: MarketData,
  strategy: StrategyConfig
): Promise<ExecutionResult> {
  const tag = `[cron:${sub.smartAccount.slice(0, 8)}]`;

  switch (decision.action) {
    case "collect":
      return executeCollect(sub, decision, position, agentConfig, marketData, tag, strategy);
    case "compound":
      return executeCompound(sub, decision, position, marketData, tag, strategy);
    case "distribute":
      return executeDistribute(sub, decision, position, marketData, tag, strategy);
    case "rebalance":
      console.log(`${tag} Rebalance requested (not yet implemented): ${decision.reason}`);
      return { executed: false };
    case "adjustRange":
      console.log(`${tag} Adjust range requested (not yet implemented): ${decision.reason}`);
      return { executed: false };
    case "hold":
      console.log(`${tag} Holding: ${decision.reason}`);
      return { executed: false };
    default:
      console.warn(`${tag} Unknown action: ${decision.action}`);
      return { executed: false };
  }
}

async function executeCollect(
  sub: Subscription,
  decision: AgentDecision,
  position: PositionSnapshot,
  agentConfig: AgentENSConfig,
  marketData: MarketData,
  tag: string,
  strategy: StrategyConfig
): Promise<ExecutionResult> {
  const tokenId = (decision.params.tokenId as string) || sub.positionTokenId;
  if (!tokenId) {
    console.log(`${tag} No tokenId for collect, skipping`);
    return { executed: false, error: "No tokenId" };
  }
  if (!position.hasPosition) {
    console.log(`${tag} No LP position, skipping collect`);
    return { executed: false, error: "No LP position" };
  }

  const balancesBefore = {
    token0: position.token0Balance,
    token1: position.token1Balance,
  };

  const collectCalls = buildCollectAction(sub.smartAccount, { tokenId }, strategy);
  const collectResult = await executeViaSessionKey(sub, collectCalls);
  if (!collectResult.success) {
    console.error(`${tag} Collect failed: ${collectResult.error}`);
    return { executed: false, error: collectResult.error };
  }

  const positionAfter = await checkSmartAccountPosition(sub.smartAccount, strategy);
  const collectedToken0 = positionAfter.token0Balance - balancesBefore.token0;
  const collectedToken1 = positionAfter.token1Balance - balancesBefore.token1;

  const collectedToken0Num = Number(formatUnits(collectedToken0, strategy.token0Decimals));
  const collectedToken1Num = Number(formatUnits(collectedToken1, strategy.token1Decimals));
  const collectedUsd =
    collectedToken0Num * marketData.token0Price + collectedToken1Num * marketData.token1Price;

  console.log(
    `${tag} Collected: ${collectedToken0Num.toFixed(8)} ${strategy.token0Symbol} + ${collectedToken1Num.toFixed(8)} ${strategy.token1Symbol} ($${collectedUsd.toFixed(2)})`
  );

  if (collectedUsd > 0) {
    const agentFeeUsd = (collectedUsd * agentConfig.feeCollectBps) / 10000;
    trackFee(sub.agentEns, sub.smartAccount, agentFeeUsd);
  }

  const prevCollected = parseFloat(sub.totalFeesCollected) || 0;
  upsertSubscription(sub.smartAccount, {
    lastActionAt: Date.now(),
    totalFeesCollected: (prevCollected + collectedUsd).toFixed(6),
  });

  return { executed: true, collectedUsd };
}

async function executeCompound(
  sub: Subscription,
  decision: AgentDecision,
  position: PositionSnapshot,
  marketData: MarketData,
  tag: string,
  strategy: StrategyConfig
): Promise<ExecutionResult> {
  const compoundPercent = (decision.params.percent as number) || sub.compoundPercent;
  if (compoundPercent <= 0) {
    return { executed: false };
  }

  const token0Amt = Number(formatUnits(position.token0Balance, strategy.token0Decimals));
  const token1Amt = Number(formatUnits(position.token1Balance, strategy.token1Decimals));
  const totalUsd = token0Amt * marketData.token0Price + token1Amt * marketData.token1Price;
  if (totalUsd < 1) {
    console.log(`${tag} Balance too low to compound ($${totalUsd.toFixed(2)})`);
    return { executed: false };
  }

  const compoundToken0 = (position.token0Balance * BigInt(compoundPercent)) / 100n;
  const compoundToken1 = (position.token1Balance * BigInt(compoundPercent)) / 100n;
  const mintCalls = buildMintAction(
    sub.smartAccount,
    {
      amount0: compoundToken0.toString(),
      amount1: compoundToken1.toString(),
      fee: decision.params.fee,
      tickSpacing: decision.params.tickSpacing,
      hooks: decision.params.hooks,
      tickLower: decision.params.tickLower,
      tickUpper: decision.params.tickUpper,
    },
    strategy
  );

  const mintResult = await executeViaSessionKey(sub, mintCalls);
  if (!mintResult.success) {
    console.error(`${tag} Compound mint failed: ${mintResult.error}`);
    return { executed: false, error: mintResult.error };
  }

  const prevCompounded = parseFloat(sub.totalFeesCompounded) || 0;
  upsertSubscription(sub.smartAccount, {
    lastActionAt: Date.now(),
    totalFeesCompounded: (prevCompounded + (totalUsd * compoundPercent) / 100).toFixed(6),
  });
  return { executed: true };
}

async function executeDistribute(
  sub: Subscription,
  decision: AgentDecision,
  position: PositionSnapshot,
  marketData: MarketData,
  tag: string,
  strategy: StrategyConfig
): Promise<ExecutionResult> {
  const distributePercent = (decision.params.percent as number) || sub.distributePercent;
  const destination = (decision.params.destination as Address) || sub.distributionAddress;
  if (distributePercent <= 0 || !destination) {
    return { executed: false };
  }

  const distributeToken0 = (position.token0Balance * BigInt(distributePercent)) / 100n;
  const distributeToken1 = (position.token1Balance * BigInt(distributePercent)) / 100n;
  if (distributeToken0 === 0n && distributeToken1 === 0n) {
    return { executed: false };
  }

  const distributeCalls: Call[] = [];
  if (distributeToken0 > 0n) {
    distributeCalls.push(
      ...buildDistributeAction({
        destination,
        token: strategy.token0,
        amount: distributeToken0.toString(),
      })
    );
  }
  if (distributeToken1 > 0n) {
    distributeCalls.push(
      ...buildDistributeAction({
        destination,
        token: strategy.token1,
        amount: distributeToken1.toString(),
      })
    );
  }

  const distResult = await executeViaSessionKey(sub, distributeCalls);
  if (!distResult.success) {
    console.error(`${tag} Distribution failed: ${distResult.error}`);
    return { executed: false, error: distResult.error };
  }

  const prevDistributed = parseFloat(sub.totalDistributed) || 0;
  const token0Usd =
    Number(formatUnits(distributeToken0, strategy.token0Decimals)) * marketData.token0Price;
  const token1Usd =
    Number(formatUnits(distributeToken1, strategy.token1Decimals)) * marketData.token1Price;
  upsertSubscription(sub.smartAccount, {
    lastActionAt: Date.now(),
    totalDistributed: (prevDistributed + token0Usd + token1Usd).toFixed(6),
  });

  return { executed: true };
}
