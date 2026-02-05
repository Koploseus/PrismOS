/**
 * Cron entry point.
 *
 * Starts the hourly position loop and daily settlement loop.
 */

import { AGENT_INTERVALS } from "../../../../packages/shared/src/constants";
import { positionLoop } from "./positionLoop";
import { settlementLoop } from "./settlementLoop";

export function startCronJobs(): void {
  console.log("[cron] Initializing cron jobs");
  console.log(`[cron] Position check interval: ${AGENT_INTERVALS.POSITION_CHECK_MS / 1000 / 60}m`);
  console.log(`[cron] Settlement interval: ${AGENT_INTERVALS.SETTLEMENT_MS / 1000 / 60 / 60}h`);

  // Run both immediately on startup
  runPositionLoop();
  runSettlementLoop();

  // Schedule recurring intervals
  setInterval(runPositionLoop, AGENT_INTERVALS.POSITION_CHECK_MS);
  setInterval(runSettlementLoop, AGENT_INTERVALS.SETTLEMENT_MS);

  console.log("[cron] Cron jobs started");
}

async function runPositionLoop(): Promise<void> {
  try {
    await positionLoop();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[cron] Position loop crashed:", message);
  }
}

async function runSettlementLoop(): Promise<void> {
  try {
    await settlementLoop();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[cron] Settlement loop crashed:", message);
  }
}
