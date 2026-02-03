import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { subscribersHandler } from "./handlers/subscribers";
import { subscribeHandler } from "./handlers/subscribe";
import { positionHandler } from "./handlers/position";
import { buildHandler } from "./handlers/build";
import { buildSettleHandler } from "./handlers/buildSettle";
import { x402Middleware } from "./middleware/x402";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

const devMode = process.env.SKIP_PAYMENT === "true" || process.env.NODE_ENV === "development";

const healthResponse = {
  service: "PrismOS API",
  version: "1.0.0",
  status: "ok",
  chain: "Base (8453)",
  payment: "x402 via Yellow Network (USDC)",
  custody: "NONE - Pure data + calldata service",
  endpoints: {
    "/api/health": { method: "GET", price: "FREE" },
    "/api/subscribers": { method: "GET", price: "$0.001" },
    "/api/subscribe": { method: "POST", price: "$0.001" },
    "/api/position/:address": { method: "GET", price: "$0.005" },
    "/api/build": { method: "POST", price: "$0.010" },
    "/api/build/settle": { method: "POST", price: "$0.010" },
  },
  devMode,
};

app.get("/", (c) => c.json(healthResponse));
app.get("/api/health", (c) => c.json(healthResponse));

app.use("/api/subscribers", x402Middleware);
app.use("/api/subscribe", x402Middleware);
app.use("/api/position/*", x402Middleware);
app.use("/api/build", x402Middleware);
app.use("/api/build/*", x402Middleware);

app.get("/api/subscribers", subscribersHandler);
app.post("/api/subscribe", subscribeHandler);
app.get("/api/position/:address", positionHandler);
app.post("/api/build", buildHandler);
app.post("/api/build/settle", buildSettleHandler);

app.get("/api/x402", (c) =>
  c.json({
    protocol: "x402 Payment Protocol",
    description: "Pay-per-call API using Yellow Network state channels",
    header: {
      name: "X-Payment",
      format: "x402:<channelId>:<amount>:<nonce>:<newBalance>:<signature>:<agentAddress>",
    },
    pricing: {
      "/api/subscribers": "0.001 USDC",
      "/api/position/:address": "0.005 USDC",
      "/api/build": "0.010 USDC",
      "/api/build/settle": "0.010 USDC",
    },
    token: {
      symbol: "USDC",
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      chain: "Base (8453)",
      decimals: 6,
    },
    yellowNetwork: {
      sandbox: "wss://clearnet-sandbox.yellow.com/ws",
      production: "wss://clearnet.yellow.com/ws",
      sdk: "@erc7824/nitrolite",
    },
  })
);

const port = parseInt(process.env.API_PORT || "3002");

// console.log(`
// ╔═══════════════════════════════════════════════════════════╗
// ║                    PrismOS API v1.0.0                     ║
// ║              Non-custodial DeFi Infrastructure            ║
// ╠═══════════════════════════════════════════════════════════╣
// ║  Endpoints:                                               ║
// ║  • GET  /api/health          - FREE                       ║
// ║  • GET  /api/subscribers     - $0.001/call                ║
// ║  • POST /api/subscribe       - $0.001/call                ║
// ║  • GET  /api/position/:addr  - $0.005/call                ║
// ║  • POST /api/build           - $0.010/call                ║
// ║  • POST /api/build/settle    - $0.010/call                ║
// ╠═══════════════════════════════════════════════════════════╣
// ║  Payment: x402 via Yellow Network (USDC)                  ║
// ║  Custody: NONE - Pure data + calldata service             ║
// ╚═══════════════════════════════════════════════════════════╝
// `);

serve({ fetch: app.fetch, port });
console.log(`Server running on http://localhost:${port}`);
