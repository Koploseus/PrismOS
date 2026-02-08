/**
 * GET /api/strategy
 *
 * Resolves ENS agent metadata into token addresses and pool parameters.
 * This is the ONLY thing the API does for strategy resolution — it reads ENS
 * and returns the token info. The agent owns ALL strategy intelligence.
 *
 * Query params:
 *   agent - ENS name (e.g. "yieldbot.prismos.eth")
 */

import { Context } from "hono";
import { resolveAgentENS, resolveStrategyConfig } from "../lib/ens";

export async function strategyHandler(c: Context): Promise<Response> {
  try {
    const agentEns = c.req.query("agent");
    if (!agentEns) {
      return c.json(
        { success: false, error: "agent query parameter required", code: "MISSING_AGENT" },
        400
      );
    }

    const ensConfig = await resolveAgentENS(agentEns);
    const strategy = resolveStrategyConfig(ensConfig);

    if (!strategy) {
      return c.json(
        { success: false, error: "Could not resolve strategy from ENS", code: "INVALID_STRATEGY" },
        400
      );
    }

    return c.json({
      success: true,
      token0: strategy.token0,
      token1: strategy.token1,
      token0Decimals: strategy.token0Decimals,
      token1Decimals: strategy.token1Decimals,
      token0Symbol: strategy.token0Symbol,
      token1Symbol: strategy.token1Symbol,
      protocol: strategy.protocol,
      chainId: strategy.chainId,
      pool: strategy.pool,
      positionManager: strategy.positionManager,
      permit2: strategy.permit2,
      poolManager: strategy.poolManager,
    });
  } catch (error: unknown) {
    console.error("[strategy]", error);
    return c.json({ success: false, error: "Internal error", code: "INTERNAL_ERROR" }, 500);
  }
}
