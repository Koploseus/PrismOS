/**
 * Hourly position loop.
 *
 * For each active subscription:
 * 1. Resolve agent ENS config
 * 2. Check on-chain position state
 * 3. Fetch market data
 * 4. Get AI agent decisions (or rule-based fallback)
 * 5. Execute decisions in order
 * 6. Update subscription stats
 */

import { Address, formatUnits } from "viem";
import { readSubscriptions, upsertSubscription, type Subscription } from "../lib/subscriptions";
import { resolveAgentENS, type AgentENSConfig } from "../lib/ens";
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

  // Fetch market data once for all subscriptions
  const marketData = await fetchMarketData();

  for (const sub of subscriptions) {
    try {
      await processSubscription(sub, marketData);

      // Reset error counter on success
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

  // Check if we should trigger early settlement
  if (shouldSettle()) {
    console.log("[cron] Fee threshold reached, triggering early settlement");
    await runSettlement();
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[cron] Position loop completed in ${elapsed}s`);
}

async function processSubscription(sub: Subscription, marketData: MarketData): Promise<void> {
  const tag = `[cron:${sub.smartAccount.slice(0, 8)}]`;

  // 1. Resolve agent ENS config
  console.log(`${tag} Resolving ENS: ${sub.agentEns}`);
  const agentConfig = await resolveAgentENS(sub.agentEns);

  // 2. Check on-chain position state
  console.log(`${tag} Checking position...`);
  const position = await checkSmartAccountPosition(sub.smartAccount);

  console.log(
    `${tag} Position: hasLP=${position.hasPosition}, walletUsd=$${position.walletValueUsd.toFixed(2)}, positions=${position.positionCount}`
  );

  // 3. Build context for AI agent
  const ctx: AgentContext = {
    position,
    agentConfig,
    marketData,
    subscription: sub,
    timestamp: Date.now(),
  };

  // 4. Get AI decisions (or rule-based fallback)
  const agentResponse = await getAgentDecisions(ctx);
  console.log(
    `${tag} Agent (${agentResponse.source}): ${agentResponse.decisions.map((d) => d.action).join(" -> ")}`
  );

  // 5. Execute decisions in order
  let currentPosition = position;
  for (const decision of agentResponse.decisions) {
    const result = await executeDecision(sub, decision, currentPosition, agentConfig, marketData);

    // Re-fetch position after successful state-changing actions
    if (result.executed && ["collect", "compound", "distribute"].includes(decision.action)) {
      currentPosition = await checkSmartAccountPosition(sub.smartAccount);
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
  marketData: MarketData
): Promise<ExecutionResult> {
  const tag = `[cron:${sub.smartAccount.slice(0, 8)}]`;

  switch (decision.action) {
    case "collect":
      return executeCollect(sub, decision, position, agentConfig, tag);

    case "compound":
      return executeCompound(sub, decision, position, marketData, tag);

    case "distribute":
      return executeDistribute(sub, decision, position, marketData, tag);

    case "rebalance":
      // Future: LiFi swap integration
      console.log(`${tag} Rebalance requested (not yet implemented): ${decision.reason}`);
      return { executed: false };

    case "adjustRange":
      // Future: withdraw + re-mint with new tick range
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
  tag: string
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

  console.log(`${tag} Collecting fees for token #${tokenId}`);

  // Snapshot balances before collect
  const balancesBefore = {
    wbtc: position.wbtcBalance,
    cbbtc: position.cbbtcBalance,
  };

  // Build and execute collect
  const collectCalls = buildCollectAction(sub.smartAccount, { tokenId });
  const collectResult = await executeViaSessionKey(sub, collectCalls);

  if (!collectResult.success) {
    console.error(`${tag} Collect failed: ${collectResult.error}`);
    return { executed: false, error: collectResult.error };
  }

  console.log(`${tag} Collect tx: ${collectResult.txHash}`);

  // Re-check balances to determine collected amounts
  const positionAfter = await checkSmartAccountPosition(sub.smartAccount);
  const collectedWbtc = positionAfter.wbtcBalance - balancesBefore.wbtc;
  const collectedCbbtc = positionAfter.cbbtcBalance - balancesBefore.cbbtc;

  const collectedWbtcNum = Number(formatUnits(collectedWbtc, 8));
  const collectedCbbtcNum = Number(formatUnits(collectedCbbtc, 8));
  const collectedUsd = (collectedWbtcNum + collectedCbbtcNum) * position.btcPrice;

  console.log(
    `${tag} Collected: ${collectedWbtcNum.toFixed(8)} WBTC + ${collectedCbbtcNum.toFixed(8)} cbBTC ($${collectedUsd.toFixed(2)})`
  );

  // Track agent fee
  if (collectedUsd > 0) {
    const agentFeeUsd = (collectedUsd * agentConfig.feeCollectBps) / 10000;
    trackFee(sub.agentEns, sub.smartAccount, agentFeeUsd);
    console.log(`${tag} Agent fee: $${agentFeeUsd.toFixed(4)} (${agentConfig.feeCollectBps}bps)`);
  }

  // Update subscription stats
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
  tag: string
): Promise<ExecutionResult> {
  const compoundPercent = (decision.params.percent as number) || sub.compoundPercent;

  if (compoundPercent <= 0) {
    console.log(`${tag} Compound percent is 0, skipping`);
    return { executed: false };
  }

  // Check if there's enough balance to compound
  const wbtcAmt = Number(formatUnits(position.wbtcBalance, 8));
  const cbbtcAmt = Number(formatUnits(position.cbbtcBalance, 8));
  const totalUsd = (wbtcAmt + cbbtcAmt) * marketData.btcPrice;

  if (totalUsd < 1) {
    console.log(`${tag} Balance too low to compound ($${totalUsd.toFixed(2)})`);
    return { executed: false };
  }

  // Calculate compound amounts
  const compoundFraction = compoundPercent / 100;
  const compoundWbtc = (position.wbtcBalance * BigInt(compoundPercent)) / 100n;
  const compoundCbbtc = (position.cbbtcBalance * BigInt(compoundPercent)) / 100n;

  console.log(
    `${tag} Compounding ${compoundPercent}%: ${formatUnits(compoundWbtc, 8)} WBTC + ${formatUnits(compoundCbbtc, 8)} cbBTC`
  );

  // Build mint action to add liquidity
  const mintCalls = buildMintAction(sub.smartAccount, {
    amount0: compoundWbtc.toString(),
    amount1: compoundCbbtc.toString(),
  });

  const mintResult = await executeViaSessionKey(sub, mintCalls);

  if (!mintResult.success) {
    console.error(`${tag} Compound mint failed: ${mintResult.error}`);
    return { executed: false, error: mintResult.error };
  }

  console.log(`${tag} Compound tx: ${mintResult.txHash}`);

  // Update stats
  const prevCompounded = parseFloat(sub.totalFeesCompounded) || 0;
  const compoundedUsd = totalUsd * compoundFraction;
  upsertSubscription(sub.smartAccount, {
    lastActionAt: Date.now(),
    totalFeesCompounded: (prevCompounded + compoundedUsd).toFixed(6),
  });

  return { executed: true };
}

async function executeDistribute(
  sub: Subscription,
  decision: AgentDecision,
  position: PositionSnapshot,
  marketData: MarketData,
  tag: string
): Promise<ExecutionResult> {
  const distributePercent = (decision.params.percent as number) || sub.distributePercent;
  const destination = (decision.params.destination as Address) || sub.distributionAddress;

  if (distributePercent <= 0 || !destination) {
    console.log(`${tag} Distribution not configured, skipping`);
    return { executed: false };
  }

  // Calculate distribution amounts
  const distributeWbtc = (position.wbtcBalance * BigInt(distributePercent)) / 100n;
  const distributeCbbtc = (position.cbbtcBalance * BigInt(distributePercent)) / 100n;

  if (distributeWbtc === 0n && distributeCbbtc === 0n) {
    console.log(`${tag} Nothing to distribute`);
    return { executed: false };
  }

  console.log(`${tag} Distributing ${distributePercent}% to ${destination.slice(0, 8)}...`);

  // Build transfer calls
  const distributeCalls: Call[] = [];

  if (distributeWbtc > 0n) {
    distributeCalls.push(
      ...buildDistributeAction({
        destination,
        token: "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c" as Address, // WBTC on Base
        amount: distributeWbtc.toString(),
      })
    );
  }

  if (distributeCbbtc > 0n) {
    distributeCalls.push(
      ...buildDistributeAction({
        destination,
        token: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as Address, // cbBTC on Base
        amount: distributeCbbtc.toString(),
      })
    );
  }

  if (distributeCalls.length === 0) {
    return { executed: false };
  }

  const distResult = await executeViaSessionKey(sub, distributeCalls);

  if (!distResult.success) {
    console.error(`${tag} Distribution failed: ${distResult.error}`);
    return { executed: false, error: distResult.error };
  }

  console.log(`${tag} Distribution tx: ${distResult.txHash}`);

  // Update stats
  const prevDistributed = parseFloat(sub.totalDistributed) || 0;
  const wbtcAmt = Number(formatUnits(distributeWbtc, 8));
  const cbbtcAmt = Number(formatUnits(distributeCbbtc, 8));
  const distributedUsd = (wbtcAmt + cbbtcAmt) * marketData.btcPrice;

  upsertSubscription(sub.smartAccount, {
    lastActionAt: Date.now(),
    totalDistributed: (prevDistributed + distributedUsd).toFixed(6),
  });

  return { executed: true };
}
