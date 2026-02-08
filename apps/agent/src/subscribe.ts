/**
 * Subscription endpoint for the agent.
 *
 * The frontend sends the serialized session key + session private key HERE
 * (to the agent), NOT to the API.
 *
 * After storing locally, we also forward (without private keys) to the API
 * so the dashboard can list subscriptions.
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { upsertSubscription, loadSubscriptions } from "./store.js";
import type { Address } from "viem";

interface SubscribeRequest {
  userAddress: string;
  smartAccount: string;
  sessionKeyAddress: string;
  serializedSessionKey: string;
  sessionPrivateKey: string;
  agentEns: string;
  permissionId?: string;
  config?: {
    compound?: number;
    destination?: string;
    destChain?: string;
  };
}

function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function respond(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

/**
 * Forward the subscription to the API (without private keys)
 * so the dashboard can query /api/subscriptions/:userAddress.
 */
async function syncToApi(body: SubscribeRequest, apiBase: string): Promise<void> {
  try {
    const res = await fetch(`${apiBase}/api/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userAddress: body.userAddress,
        smartAccount: body.smartAccount,
        sessionKeyAddress: body.sessionKeyAddress,
        serializedSessionKey: body.serializedSessionKey,
        // NOTE: sessionPrivateKey is NOT sent to the API
        agentEns: body.agentEns,
        permissionId: body.permissionId,
        config: body.config,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      console.log(`[subscribe] Synced to API: ${body.smartAccount}`);
    } else {
      console.warn(`[subscribe] API sync failed: ${res.status}`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown";
    console.warn(`[subscribe] API sync error (non-blocking): ${msg}`);
  }
}

export function startSubscribeServer(port: number = 3003): void {
  const apiBase = process.env.API_BASE_URL || "http://localhost:3002";

  const server = createServer(async (req, res) => {
    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    if (req.method === "POST" && req.url === "/subscribe") {
      try {
        const body = (await parseBody(req)) as SubscribeRequest;

        if (!body.smartAccount || !body.serializedSessionKey || !body.sessionPrivateKey) {
          respond(res, 400, { success: false, error: "Missing required fields" });
          return;
        }

        const compound = body.config?.compound ?? 70;

        upsertSubscription(body.smartAccount, {
          userAddress: body.userAddress as Address,
          sessionKeyAddress: body.sessionKeyAddress as Address,
          serializedSessionKey: body.serializedSessionKey,
          sessionPrivateKey: body.sessionPrivateKey,
          agentEns: body.agentEns,
          permissionId: body.permissionId ?? null,
          compoundPercent: compound,
          distributePercent: 100 - compound,
          distributionAddress: (body.config?.destination || body.userAddress) as Address,
          distributionMode: compound >= 90 ? "compound" : compound <= 10 ? "distribute" : "mixed",
          status: "active",
        });

        console.log(`[subscribe] Registered: ${body.smartAccount}`);

        // Non-blocking sync to API for dashboard visibility
        syncToApi(body, apiBase).catch(() => {});

        respond(res, 200, { success: true, smartAccount: body.smartAccount });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[subscribe] Error:", message);
        respond(res, 500, { success: false, error: message });
      }
      return;
    }

    // GET /subscriptions/:userAddress — allow dashboard to query agent-side subs directly
    if (req.method === "GET" && req.url?.startsWith("/subscriptions/")) {
      try {
        const userAddress = req.url.split("/subscriptions/")[1]?.split("?")[0];
        if (!userAddress) {
          respond(res, 400, { success: false, error: "Missing user address" });
          return;
        }

        const allSubs = loadSubscriptions();
        const userSubs = allSubs.filter(
          (s) => s.userAddress.toLowerCase() === userAddress.toLowerCase()
        );

        respond(res, 200, {
          success: true,
          userAddress,
          subscriptions: userSubs.map((s) => ({
            smartAccount: s.smartAccount,
            agentEns: s.agentEns,
            status: s.status,
            subscribedAt: s.subscribedAt,
            positionTokenId: s.positionTokenId ?? null,
            totalFeesCollected: "0",
            totalFeesCompounded: "0",
            totalDistributed: "0",
            compoundPercent: s.compoundPercent,
            distributePercent: s.distributePercent,
          })),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("[subscribe] Subscriptions query error:", message);
        respond(res, 500, { success: false, error: message });
      }
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      respond(res, 200, { status: "ok", service: "PrismOS Agent" });
      return;
    }

    respond(res, 404, { error: "Not found" });
  });

  server.listen(port, () => {
    console.log(`[subscribe] Agent subscribe server on http://localhost:${port}`);
  });
}
