/**
 * Settlement loop (24h or triggered early when > $10).
 *
 * Aggregates accumulated agent fees and settles via Yellow Network.
 * For MVP: logs settlement summary and clears accumulator.
 * Future: calls Yellow Network on-chain settlement contract.
 */

import { getAccumulatedFees, clearAccumulatedFees, getFeeSummary } from "./feeTracker";

export async function runSettlement(): Promise<void> {
  console.log("[settlement] Starting settlement cycle");

  const fees = getAccumulatedFees();

  if (fees.size === 0) {
    console.log("[settlement] No fees to settle");
    return;
  }

  const summary = getFeeSummary();
  let grandTotal = 0;

  console.log("[settlement] === Settlement Summary ===");
  for (const entry of summary) {
    console.log(
      `[settlement]   Agent: ${entry.agent} | Total: $${entry.totalUsd.toFixed(4)} | Entries: ${entry.entryCount}`
    );
    grandTotal += entry.totalUsd;
  }
  console.log(`[settlement] Grand total: $${grandTotal.toFixed(4)}`);
  console.log("[settlement] ===========================");

  // TODO: Call Yellow Network on-chain settlement contract
  // Uses AGENT_PRIVATE_KEY to sign settlement tx from agent EOA
  // ABI available in handlers/buildSettle.ts (YELLOW_ABI.batchSettle)

  // For MVP: just clear the accumulator after logging
  clearAccumulatedFees();

  console.log("[settlement] Settlement cycle completed");
}

export async function settlementLoop(): Promise<void> {
  console.log("[cron] Starting settlement loop");

  try {
    await runSettlement();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[settlement] Error:", message);
  }
}
