/**
 * POST /api/subscribe
 *
 * Create or update a subscription.
 */

import { Context } from "hono";
import { Address, isAddress } from "viem";
import { generateReceipt } from "../middleware/x402";
import { getSubscriptionBySmartAccount, upsertSubscription } from "../lib/subscriptions";

interface SubscribeRequest {
  userAddress: string;
  smartAccount: string;
  sessionKeyAddress: string;
  serializedSessionKey: string;
  agentEns: string;
  permissionId?: string;
  config?: { compound?: number; destination?: string; destChain?: string };
}

function validate(body: unknown): SubscribeRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  const required = [
    "userAddress",
    "smartAccount",
    "sessionKeyAddress",
    "serializedSessionKey",
    "agentEns",
  ];
  for (const f of required) {
    if (!b[f] || typeof b[f] !== "string") return null;
  }

  if (!isAddress(b.userAddress as string)) return null;
  if (!isAddress(b.smartAccount as string)) return null;
  if (!isAddress(b.sessionKeyAddress as string)) return null;

  return b as unknown as SubscribeRequest;
}

export async function subscribeHandler(c: Context): Promise<Response> {
  try {
    const body = await c.req.json();
    const req = validate(body);

    if (!req) {
      return c.json({ success: false, error: "Invalid request", code: "INVALID_REQUEST" }, 400);
    }

    const existing = getSubscriptionBySmartAccount(req.smartAccount as Address);
    const isUpdate = existing !== null;

    const compound = req.config?.compound ?? 70;
    const distribute = 100 - compound;
    const mode = compound >= 90 ? "compound" : compound <= 10 ? "distribute" : "mixed";

    upsertSubscription(req.smartAccount as Address, {
      userAddress: req.userAddress as Address,
      sessionKeyAddress: req.sessionKeyAddress as Address,
      serializedSessionKey: req.serializedSessionKey,
      agentEns: req.agentEns,
      permissionId: req.permissionId ?? null,
      distributionMode: mode as "compound" | "distribute" | "mixed",
      compoundPercent: compound,
      distributePercent: distribute,
      distributionAddress: (req.config?.destination || req.userAddress) as Address,
      destinationChain: req.config?.destChain ? parseInt(req.config.destChain) : undefined,
      status: "active",
    });

    console.log(`[subscribe] ${isUpdate ? "Updated" : "Created"}: ${req.smartAccount}`);

    return c.json({
      success: true,
      action: isUpdate ? "updated" : "created",
      smartAccount: req.smartAccount,
      agent: req.agentEns,
      receipt: generateReceipt(c.get("paymentId"), "/api/subscribe", 0.001, [
        isUpdate ? "update" : "create",
      ]),
    });
  } catch (error: unknown) {
    console.error("[subscribe]", error);
    return c.json({ success: false, error: "Internal error", code: "INTERNAL_ERROR" }, 500);
  }
}
