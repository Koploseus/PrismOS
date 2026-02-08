import "dotenv/config";
import { startAgent } from "./loop.js";
import { startSubscribeServer } from "./subscribe.js";

const AGENT_ENS = process.env.AGENT_ENS || "";
const API_BASE = process.env.API_BASE_URL || "http://localhost:3002";
const LOOP_INTERVAL_MS = parseInt(process.env.LOOP_INTERVAL_MS || "3600000");
const SUBSCRIBE_PORT = parseInt(process.env.SUBSCRIBE_PORT || "3003");

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                  PrismOS Agent v1.0.0                     ║
║            Non-custodial DeFi Automation                  ║
╠═══════════════════════════════════════════════════════════╣
║  Agent ENS:  ${AGENT_ENS.padEnd(42)}║
║  API:        ${API_BASE.padEnd(42)}║
║  Interval:   ${(LOOP_INTERVAL_MS / 1000 / 60 + "m").padEnd(42)}║
║  Subscribe:  ${("http://localhost:" + SUBSCRIBE_PORT).padEnd(42)}║
╚═══════════════════════════════════════════════════════════╝
`);

  // Start the subscribe server (receives session keys from frontend)
  startSubscribeServer(SUBSCRIBE_PORT);

  if (!AGENT_ENS) {
    console.warn("[agent] AGENT_ENS not set - will only accept subscriptions, no active management");
  } else {
    // Run immediately
    await runLoop();
    // Schedule recurring
    setInterval(runLoop, LOOP_INTERVAL_MS);
  }

  console.log("[agent] Agent running. Press Ctrl+C to stop.");
}

async function runLoop() {
  try {
    await startAgent({ agentEns: AGENT_ENS, apiBase: API_BASE });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[agent] Loop crashed:", message);
  }
}

main().catch((err) => {
  console.error("[agent] Fatal:", err);
  process.exit(1);
});
