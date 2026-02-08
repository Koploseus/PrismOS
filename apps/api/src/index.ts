import { config as dotenvConfig } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, "../../../.env") });
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { subscribersHandler } from "./handlers/subscribers.js";
import { subscribeHandler } from "./handlers/subscribe.js";
import { revokeHandler } from "./handlers/revoke.js";
import { userSubscriptionsHandler } from "./handlers/userSubscriptions.js";
import { positionHandler } from "./handlers/position.js";
import { buildHandler } from "./handlers/build.js";
import { buildSettleHandler } from "./handlers/buildSettle.js";
import { x402Middleware } from "./middleware/x402.js";

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
    "/api/revoke": { method: "POST", price: "FREE" },
    "/api/subscriptions/:userAddress": { method: "GET", price: "FREE" },
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
app.post("/api/revoke", revokeHandler);
app.get("/api/subscriptions/:userAddress", userSubscriptionsHandler);
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

serve({ fetch: app.fetch, port });
console.log(`[api] PrismOS API running on http://localhost:${port}`);
console.log(`[api] Mode: ${devMode ? "DEV (payments skipped)" : "PRODUCTION"}`);
