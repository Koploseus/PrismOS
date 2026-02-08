import { config as dotenvConfig } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, "../../../.env") });
import { startAgent } from "./loop.js";
import { startSubscribeServer } from "./subscribe.js";
import { startDepositWatcher } from "./watcher.js";

const AGENT_ENS = process.env.AGENT_ENS || "";
const API_BASE = process.env.API_BASE_URL || "http://localhost:3002";
const LOOP_INTERVAL_MS = parseInt(process.env.LOOP_INTERVAL_MS || "3600000");
const SUBSCRIBE_PORT = parseInt(process.env.SUBSCRIBE_PORT || "3003");
const DEPOSIT_POLL_MS = parseInt(process.env.DEPOSIT_POLL_MS || "30000");

/** Resolve chain ID from ENS strategy via the API, fallback to env or default (1) */
async function resolveChainId(): Promise<number> {
  // Env override
  const envChain = process.env.CHAIN_ID;
  if (envChain) return parseInt(envChain);

  if (!AGENT_ENS) return 1;

  // Try to fetch strategy from API to get chainId
  try {
    const res = await fetch(`${API_BASE}/api/strategy?agent=${encodeURIComponent(AGENT_ENS)}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.chainId) return data.chainId;
    }
  } catch {
    // Fallback
  }
  return 1; // Default: Ethereum mainnet
}

async function main() {
  const chainId = await resolveChainId();

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                  PrismOS Agent v1.0.0                     ║
║            Non-custodial DeFi Automation                  ║
╠═══════════════════════════════════════════════════════════╣
║  Agent ENS:  ${AGENT_ENS.padEnd(42)}║
║  API:        ${API_BASE.padEnd(42)}║
║  Chain:      ${String(chainId).padEnd(42)}║
║  Interval:   ${(LOOP_INTERVAL_MS / 1000 / 60 + "m").padEnd(42)}║
║  Deposit:    ${(DEPOSIT_POLL_MS / 1000 + "s poll").padEnd(42)}║
║  Subscribe:  ${("http://localhost:" + SUBSCRIBE_PORT).padEnd(42)}║
╚═══════════════════════════════════════════════════════════╝
`);

  // 1. Start the subscribe server (receives session keys from frontend)
  startSubscribeServer(SUBSCRIBE_PORT);

  // 2. Start deposit watcher (polls USDC balances, triggers swap+mint)
  startDepositWatcher(API_BASE, chainId, DEPOSIT_POLL_MS);

  // 3. Start agent management loop (collect, compound, distribute, rebalance)
  if (!AGENT_ENS) {
    console.warn("[agent] AGENT_ENS not set - deposit watcher active, management loop disabled");
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
