/**
 * AI Agent Brain.
 */

import Anthropic from "@anthropic-ai/sdk";
import { formatUnits } from "viem";
import type { AgentSubscription } from "./store.js";
import type { PositionSnapshot } from "./loop.js";

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
  confidence: number;
  params: Record<string, unknown>;
}

export interface AgentContext {
  position: PositionSnapshot;
  marketData: MarketData;
  subscription: AgentSubscription;
  timestamp: number;
}

export interface MarketData {
  btcPrice: number;
  token0Price: number;
  token1Price: number;
  spreadPercent: number;
  poolApy?: { apy: number };
}

export interface AgentResponse {
  decisions: AgentDecision[];
  reasoning: string;
  source: "ai" | "rules";
}

const DECISION_TOOL = {
  name: "submit_decisions",
  description: "Submit the agent's decisions for LP position management.",
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
            },
            reason: { type: "string" as const },
            confidence: { type: "number" as const, minimum: 0, maximum: 100 },
            params: { type: "object" as const, additionalProperties: true },
          },
          required: ["action", "reason", "confidence"],
        },
      },
      reasoning: { type: "string" as const },
    },
    required: ["decisions", "reasoning"],
  },
};

const SYSTEM_PROMPT = `You are an AI agent managing Uniswap V4 LP positions for users. You analyze market data and position state to make optimal decisions.

## Available Actions
- **collect**: Collect accrued LP fees. Do this when fees > $1.
- **compound**: Re-invest collected fees back into the LP position.
- **distribute**: Send a portion of collected fees to user's distribution address.
- **rebalance**: Swap tokens to maintain optimal ratio via LI.FI.
- **adjustRange**: Withdraw and re-enter with new tick range.
- **hold**: Take no action.

## Decision Rules
1. Always collect first if there are fees > $1
2. After collecting, split according to user's compound/distribute percentages
3. Only suggest rebalance if ratio is significantly off (> 5%)
4. Only suggest adjustRange for high volatility - this is expensive
5. Consider gas costs
6. Multiple actions can be chained: collect -> compound -> distribute

Be conservative - when in doubt, hold.`;

function buildUserPrompt(ctx: AgentContext): string {
  const { position, marketData, subscription } = ctx;

  const token0Amt = Number(
    formatUnits(BigInt(position.token0BalanceRaw || "0"), position.token0Decimals)
  );
  const token1Amt = Number(
    formatUnits(BigInt(position.token1BalanceRaw || "0"), position.token1Decimals)
  );
  const total = token0Amt + token1Amt;
  const token0Ratio = total > 0 ? (token0Amt / total) * 100 : 50;

  return `## Current Position State
- Smart Account: ${subscription.smartAccount}
- Has LP Position: ${position.hasPosition}
- Wallet Value: $${position.walletValueUsd.toFixed(2)}
- ${position.token0Symbol}/${position.token1Symbol} Ratio: ${token0Ratio.toFixed(1)}% / ${(100 - token0Ratio).toFixed(1)}%

## User Configuration
- Compound: ${subscription.compoundPercent}%
- Distribute: ${subscription.distributePercent}%
- Distribution Address: ${subscription.distributionAddress || "Not set"}

## Market Conditions
- BTC Price: $${marketData.btcPrice.toFixed(2)}
- ${position.token0Symbol}/${position.token1Symbol} Spread: ${marketData.spreadPercent.toFixed(4)}%
- Pool APY: ${marketData.poolApy?.apy?.toFixed(2) ?? "Unknown"}%

Make your decisions using the submit_decisions tool.`;
}

export function ruleBasedDecisions(ctx: AgentContext): AgentResponse {
  const { position, subscription, marketData } = ctx;
  const decisions: AgentDecision[] = [];

  const token0Amt = Number(
    formatUnits(BigInt(position.token0BalanceRaw || "0"), position.token0Decimals)
  );
  const token1Amt = Number(
    formatUnits(BigInt(position.token1BalanceRaw || "0"), position.token1Decimals)
  );
  const total = token0Amt + token1Amt;

  if (position.hasPosition && subscription.positionTokenId) {
    decisions.push({
      action: "collect",
      reason: "Position has potential fees to collect",
      confidence: 80,
      params: { tokenId: subscription.positionTokenId },
    });

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

    if (subscription.compoundPercent > 0) {
      decisions.push({
        action: "compound",
        reason: `Compounding ${subscription.compoundPercent}% per user config`,
        confidence: 90,
        params: { percent: subscription.compoundPercent },
      });
    }
  }

  if (total > 0.0001) {
    const token0Ratio = token0Amt / total;
    if (Math.abs(token0Ratio - 0.5) > 0.05) {
      decisions.push({
        action: "rebalance",
        reason: `Token ratio is ${(token0Ratio * 100).toFixed(1)}% ${position.token0Symbol}, needs rebalancing`,
        confidence: 70,
        params: { currentRatio: token0Ratio, targetRatio: 0.5 },
      });
    }
  }

  if (Math.abs(marketData.spreadPercent) > 0.5) {
    decisions.push({
      action: "adjustRange",
      reason: `High spread volatility (${marketData.spreadPercent.toFixed(3)}%)`,
      confidence: 50,
      params: { currentSpread: marketData.spreadPercent },
    });
  }

  if (decisions.length === 0) {
    decisions.push({ action: "hold", reason: "No actions needed", confidence: 95, params: {} });
  }

  return { decisions, reasoning: "Rule-based decisions", source: "rules" };
}

export async function getAgentDecisions(ctx: AgentContext): Promise<AgentResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.AGENT_MODEL || "claude-haiku-4-20250414";

  if (!apiKey) {
    console.log("[brain] No ANTHROPIC_API_KEY, using rule-based decisions");
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
      messages: [{ role: "user", content: buildUserPrompt(ctx) }],
    });

    const toolUse = response.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return ruleBasedDecisions(ctx);
    }

    const input = toolUse.input as { decisions: AgentDecision[]; reasoning: string };
    const validDecisions = (input.decisions || []).filter(
      (d) =>
        d.action &&
        ["collect", "compound", "rebalance", "adjustRange", "distribute", "hold"].includes(
          d.action
        ) &&
        typeof d.reason === "string" &&
        typeof d.confidence === "number"
    );

    if (validDecisions.length === 0) {
      return ruleBasedDecisions(ctx);
    }

    console.log(
      `[brain] AI decisions: ${validDecisions.map((d) => d.action).join(" -> ")} (${model})`
    );

    return {
      decisions: validDecisions.map((d) => ({ ...d, params: d.params || {} })),
      reasoning: input.reasoning || "AI-generated decisions",
      source: "ai",
    };
  } catch (error) {
    console.error("[brain] Claude API error:", error instanceof Error ? error.message : error);
    return ruleBasedDecisions(ctx);
  }
}
