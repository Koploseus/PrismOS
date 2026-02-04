/**
 * GET /api/subscriptions/:userAddress
 *
 * List all subscriptions for a given user address.
 */

import { Context } from "hono";
import { isAddress } from "viem";
import { getSubscriptionsByUser } from "../lib/subscriptions";

export async function userSubscriptionsHandler(c: Context): Promise<Response> {
  try {
    const userAddress = c.req.param("userAddress");

    if (!userAddress || !isAddress(userAddress)) {
      return c.json(
        {
          success: false,
          error: "Invalid or missing user address",
          code: "INVALID_ADDRESS",
        },
        400
      );
    }

    const subs = getSubscriptionsByUser(userAddress);

    return c.json({
      success: true,
      userAddress,
      subscriptions: subs.map((s) => ({
        smartAccount: s.smartAccount,
        agentEns: s.agentEns,
        status: s.status,
        subscribedAt: s.subscribedAt,
        positionTokenId: s.positionTokenId ?? null,
        totalFeesCollected: s.totalFeesCollected,
        totalFeesCompounded: s.totalFeesCompounded,
        totalDistributed: s.totalDistributed,
        compoundPercent: s.compoundPercent,
        distributePercent: s.distributePercent,
      })),
    });
  } catch (error: unknown) {
    console.error("[userSubscriptions]", error);
    return c.json({ success: false, error: "Internal error", code: "INTERNAL_ERROR" }, 500);
  }
}
