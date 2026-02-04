/**
 * POST /api/revoke
 *
 * Revoke a subscription (mark as revoked, clear session key data).
 */

import { Context } from "hono";
import { Address, isAddress } from "viem";
import { getSubscriptionBySmartAccount, upsertSubscription } from "../lib/subscriptions";

interface RevokeRequest {
  smartAccount: string;
  userAddress: string;
}

function validate(body: unknown): RevokeRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  if (!b.smartAccount || typeof b.smartAccount !== "string") return null;
  if (!b.userAddress || typeof b.userAddress !== "string") return null;
  if (!isAddress(b.smartAccount as string)) return null;
  if (!isAddress(b.userAddress as string)) return null;

  return b as unknown as RevokeRequest;
}

export async function revokeHandler(c: Context): Promise<Response> {
  try {
    const body = await c.req.json();
    const req = validate(body);

    if (!req) {
      return c.json({ success: false, error: "Invalid request", code: "INVALID_REQUEST" }, 400);
    }

    const existing = getSubscriptionBySmartAccount(req.smartAccount as Address);

    if (!existing) {
      return c.json({ success: false, error: "Subscription not found", code: "NOT_FOUND" }, 404);
    }

    if (existing.userAddress.toLowerCase() !== req.userAddress.toLowerCase()) {
      return c.json({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" }, 403);
    }

    upsertSubscription(req.smartAccount as Address, {
      status: "revoked",
      sessionKeyAddress: null,
      serializedSessionKey: null,
    });

    console.log(`[revoke] Revoked subscription: ${req.smartAccount}`);

    return c.json({
      success: true,
      smartAccount: req.smartAccount,
      status: "revoked",
    });
  } catch (error: unknown) {
    console.error("[revoke]", error);
    return c.json({ success: false, error: "Internal error", code: "INTERNAL_ERROR" }, 500);
  }
}
