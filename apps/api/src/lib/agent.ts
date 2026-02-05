/**
 * AI Agent Brain.
 *
 * Uses Claude to make intelligent decisions about LP position management
 * based on market conditions, user config, and position state.
 *
 * Falls back to rule-based decisions when API key unavailable or on error.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { PositionSnapshot } from "./positionChecker";
import type { AgentENSConfig } from "./ens";
import type { MarketData } from "./defillama";
import type { Subscription } from "./subscriptions";
import { formatUnits } from "viem";

// Types
export type AgentAction =
  | "collect"
  | "compound"
  | "rebalance"
  | "adjustRange"
  | "distribute"
  | "hold";

export interface AgentDecision {
  action: AgentAction;
  reason: string;
  confidence: number; // 0-100
  params: Record<string, unknown>;
}

export interface AgentContext {
  position: PositionSnapshot;
  agentConfig: AgentENSConfig;
  marketData: MarketData;
  subscription: Subscription;
  timestamp: number;
}

export interface AgentResponse {
  decisions: AgentDecision[];
  reasoning: string;
  source: "ai" | "rules";
}

// Tool schema for structured output
const DECISION_TOOL = {
  name: "submit_decisions",
  description:
    "Submit the agent's decisions for LP position management. Call this once with all decisions for this cycle.",
  input_schema: {
    type: "object" as const,
    properties: {
      decisions: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            action: {
              type: "string" as const,
              enum: ["collect", "compound", "rebalance", "adjustRange", "distribute", "hold"],
              description: "The action to take",
            },
            reason: {
              type: "string" as const,
              description: "Brief explanation for this decision",
            },
            confidence: {
              type: "number" as const,
              minimum: 0,
              maximum: 100,
              description: "Confidence level 0-100",
            },
            params: {
              type: "object" as const,
              description: "Action-specific parameters",
              additionalProperties: true,
            },
          },
          required: ["action", "reason", "confidence"],
        },
        description: "Ordered list of actions to execute",
      },
      reasoning: {
        type: "string" as const,
        description: "Overall reasoning for this decision set",
      },
    },
    required: ["decisions", "reasoning"],
  },
};

const SYSTEM_PROMPT = `You are an AI agent managing Uniswap V4 LP positions for users. You analyze market data and position state to make optimal decisions.

## Available Actions
- **collect**: Collect accrued LP fees. Do this when fees > $1.
- **compound**: Re-invest collected fees back into the LP position. Respect user's compoundPercent setting.
- **distribute**: Send a portion of collected fees to user's distribution address. Respect user's distributePercent setting.
- **rebalance**: Swap tokens to maintain optimal ratio. Do this when WBTC/cbBTC ratio deviates > 5% from 50:50.
- **adjustRange**: Withdraw and re-enter with new tick range. Do this when spread volatility is high (> 0.5%).
- **hold**: Take no action. Choose this when position is optimal and no fees to collect.

## Decision Rules
1. Always collect first if there are fees > $1 to collect
2. After collecting, split according to user's compound/distribute percentages
3. Only suggest rebalance if ratio is significantly off AND there are tokens to rebalance
4. Only suggest adjustRange for high volatility periods - this is expensive
5. Consider gas costs - don't suggest actions for tiny amounts
6. Multiple actions can be chained: collect -> compound -> distribute

## Output Format
Use the submit_decisions tool with:
- An ordered list of decisions (they execute in sequence)
- Each decision has: action, reason, confidence (0-100), optional params
- Overall reasoning explaining your analysis

Be conservative - when in doubt, hold.`;

function buildUserPrompt(ctx: AgentContext): string {
  const { position, agentConfig, marketData, subscription } = ctx;

  const wbtcAmt = Number(formatUnits(position.wbtcBalance, 8));
  const cbbtcAmt = Number(formatUnits(position.cbbtcBalance, 8));
  const totalBtc = wbtcAmt + cbbtcAmt;
  const wbtcRatio = totalBtc > 0 ? (wbtcAmt / totalBtc) * 100 : 50;

  return `## Current Position State
- Smart Account: ${subscription.smartAccount}
- Has LP Position: ${position.hasPosition}
- Position Token ID: ${subscription.positionTokenId ?? "None"}
- LP Position Count: ${position.positionCount}
- Wallet Value: $${position.walletValueUsd.toFixed(2)}
- WBTC Balance: ${wbtcAmt.toFixed(8)} ($${(wbtcAmt * marketData.wbtcPrice).toFixed(2)})
- cbBTC Balance: ${cbbtcAmt.toFixed(8)} ($${(cbbtcAmt * marketData.cbbtcPrice).toFixed(2)})
- WBTC/cbBTC Ratio: ${wbtcRatio.toFixed(1)}% / ${(100 - wbtcRatio).toFixed(1)}%

## User Configuration
- Compound Percent: ${subscription.compoundPercent}%
- Distribute Percent: ${subscription.distributePercent}%
- Distribution Address: ${subscription.distributionAddress || "Not set"}
- Distribution Mode: ${subscription.distributionMode}

## Agent Strategy (from ENS)
- Strategy: ${agentConfig.strategyId ?? "default"}
- Risk Profile: ${agentConfig.strategyRisk ?? "moderate"}
- Protocol: ${agentConfig.strategyProtocol ?? "uniswap-v4"}
- Pool: ${agentConfig.strategyPool ?? "WBTC/cbBTC"}

## Market Conditions
- BTC Price: $${marketData.btcPrice.toFixed(2)}
- WBTC Price: $${marketData.wbtcPrice.toFixed(2)}
- cbBTC Price: $${marketData.cbbtcPrice.toFixed(2)}
- WBTC/cbBTC Spread: ${marketData.wbtcCbbtcSpread.toFixed(4)}%
- Pool APY: ${marketData.poolApy?.apy?.toFixed(2) ?? "Unknown"}%
- Alternative Pool APYs: ${marketData.alternativePoolApys.map((p) => `${p.symbol}: ${p.apy.toFixed(2)}%`).join(", ") || "None"}
- Uniswap Base TVL: $${(marketData.uniswapBaseTvl / 1e9).toFixed(2)}B

## Historical Stats
- Total Fees Collected: $${subscription.totalFeesCollected}
- Total Compounded: $${subscription.totalFeesCompounded}
- Total Distributed: $${subscription.totalDistributed}
- Last Action: ${subscription.lastActionAt ? new Date(subscription.lastActionAt).toISOString() : "Never"}

## Task
Analyze the position and market conditions, then decide what actions to take (if any). Consider:
1. Are there fees worth collecting?
2. Should we compound, distribute, or both?
3. Is the token ratio optimal or does it need rebalancing?
4. Is the tick range appropriate for current volatility?

Make your decisions using the submit_decisions tool.`;
}

/**
 * Rule-based fallback decisions.
 * Replicates the mechanical logic from the original positionLoop.
 */
export function ruleBasedDecisions(ctx: AgentContext): AgentResponse {
  const { position, subscription, marketData } = ctx;
  const decisions: AgentDecision[] = [];

  const wbtcAmt = Number(formatUnits(position.wbtcBalance, 8));
  const cbbtcAmt = Number(formatUnits(position.cbbtcBalance, 8));
  const totalBtc = wbtcAmt + cbbtcAmt;
  const walletValueUsd = position.walletValueUsd;

  // Rule 1: Collect if has position and token ID
  if (position.hasPosition && subscription.positionTokenId) {
    decisions.push({
      action: "collect",
      reason: "Position has potential fees to collect",
      confidence: 80,
      params: { tokenId: subscription.positionTokenId },
    });

    // Rule 2: After collect, distribute if configured
    if (subscription.distributePercent > 0 && subscription.distributionAddress) {
      decisions.push({
        action: "distribute",
        reason: `Distributing ${subscription.distributePercent}% per user config`,
        confidence: 90,
        params: {
          percent: subscription.distributePercent,
          destination: subscription.distributionAddress,
        },
      });
    }

    // Rule 3: After collect, compound if configured
    if (subscription.compoundPercent > 0) {
      decisions.push({
        action: "compound",
        reason: `Compounding ${subscription.compoundPercent}% per user config`,
        confidence: 90,
        params: { percent: subscription.compoundPercent },
      });
    }
  }

  // Rule 4: Check if rebalance needed (ratio off by > 5%)
  if (totalBtc > 0.0001) {
    const wbtcRatio = wbtcAmt / totalBtc;
    if (Math.abs(wbtcRatio - 0.5) > 0.05) {
      decisions.push({
        action: "rebalance",
        reason: `Token ratio is ${(wbtcRatio * 100).toFixed(1)}% WBTC, needs rebalancing`,
        confidence: 70,
        params: { currentRatio: wbtcRatio, targetRatio: 0.5 },
      });
    }
  }

  // Rule 5: Check if range adjustment needed (high spread volatility)
  if (Math.abs(marketData.wbtcCbbtcSpread) > 0.5) {
    decisions.push({
      action: "adjustRange",
      reason: `High spread volatility (${marketData.wbtcCbbtcSpread.toFixed(3)}%)`,
      confidence: 50,
      params: { currentSpread: marketData.wbtcCbbtcSpread },
    });
  }

  // If no actions, hold
  if (decisions.length === 0) {
    decisions.push({
      action: "hold",
      reason: "No actions needed at this time",
      confidence: 95,
      params: {},
    });
  }

  return {
    decisions,
    reasoning: "Rule-based decisions based on position state and user config",
    source: "rules",
  };
}

/**
 * Get agent decisions using Claude API.
 * Falls back to rule-based decisions on error.
 */
export async function getAgentDecisions(ctx: AgentContext): Promise<AgentResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.AGENT_MODEL || "claude-haiku-4-20250414";

  // Fallback if no API key
  if (!apiKey) {
    console.log("[agent] No ANTHROPIC_API_KEY, using rule-based decisions");
    return ruleBasedDecisions(ctx);
  }

  try {
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [DECISION_TOOL],
      tool_choice: { type: "tool", name: "submit_decisions" },
      messages: [
        {
          role: "user",
          content: buildUserPrompt(ctx),
        },
      ],
    });

    // Extract tool use from response
    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      console.warn("[agent] No tool use in response, falling back to rules");
      return ruleBasedDecisions(ctx);
    }

    const input = toolUse.input as {
      decisions: AgentDecision[];
      reasoning: string;
    };

    // Validate decisions
    if (!Array.isArray(input.decisions) || input.decisions.length === 0) {
      console.warn("[agent] Invalid decisions array, falling back to rules");
      return ruleBasedDecisions(ctx);
    }

    // Ensure all decisions have required fields
    const validDecisions = input.decisions.filter(
      (d) =>
        d.action &&
        ["collect", "compound", "rebalance", "adjustRange", "distribute", "hold"].includes(
          d.action
        ) &&
        typeof d.reason === "string" &&
        typeof d.confidence === "number"
    );

    if (validDecisions.length === 0) {
      console.warn("[agent] No valid decisions, falling back to rules");
      return ruleBasedDecisions(ctx);
    }

    console.log(
      `[agent] AI decisions: ${validDecisions.map((d) => d.action).join(" -> ")} (${model})`
    );

    return {
      decisions: validDecisions.map((d) => ({
        ...d,
        params: d.params || {},
      })),
      reasoning: input.reasoning || "AI-generated decisions",
      source: "ai",
    };
  } catch (error) {
    console.error("[agent] Claude API error:", error instanceof Error ? error.message : error);
    return ruleBasedDecisions(ctx);
  }
}
