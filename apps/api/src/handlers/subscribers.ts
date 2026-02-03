/**
 * GET /api/subscribers
 *
 * List subscribers for an agent.
 */

import { Context } from "hono";
import { generateReceipt } from "../middleware/x402";
import { getSubscriptionsByAgent, toSubscriberView } from "../lib/subscriptions";

export async function subscribersHandler(c: Context): Promise<Response> {
  try {
    const agentEns = c.req.query("agent") || c.req.header("X-Agent-ENS");

    if (!agentEns) {
      return c.json(
        {
          success: false,
          error: "Missing agent",
          code: "MISSING_AGENT",
          hint: "?agent=myagent.eth or X-Agent-ENS header",
        },
        400
      );
    }

    const subs = getSubscriptionsByAgent(agentEns).map(toSubscriberView);

    return c.json({
      success: true,
      agent: agentEns,
      count: subs.length,
      subscribers: subs,
      timestamp: Date.now(),
      receipt: generateReceipt(c.get("paymentId"), "/api/subscribers", 0.001, ["query"]),
    });
  } catch (error: unknown) {
    console.error("[subscribers]", error);
    return c.json({ success: false, error: "Internal error", code: "INTERNAL_ERROR" }, 500);
  }
}
