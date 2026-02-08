/**
 * Basic test suite for the agent.
 */

import { ruleBasedDecisions, type AgentContext } from "../brain.js";
import { fetchMarketData } from "../market.js";
import type { AgentSubscription } from "../store.js";
import type { PositionSnapshot } from "../loop.js";
import type { Address } from "viem";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

function mockSubscription(overrides: Partial<AgentSubscription> = {}): AgentSubscription {
  return {
    smartAccount: "0x1234567890123456789012345678901234567890" as Address,
    userAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address,
    sessionKeyAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
    serializedSessionKey: "mock-serialized",
    sessionPrivateKey: "0xdeadbeef",
    agentEns: "test-agent.prismos.eth",
    permissionId: null,
    compoundPercent: 70,
    distributePercent: 30,
    distributionAddress: "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
    distributionMode: "mixed",
    positionTokenId: "12345",
    status: "active",
    lastActionAt: null,
    subscribedAt: Date.now(),
    ...overrides,
  };
}

function mockPosition(overrides: Partial<PositionSnapshot> = {}): PositionSnapshot {
  return {
    hasPosition: true,
    walletValueUsd: 1000,
    wbtcBalanceRaw: "50000000", // 0.5 WBTC
    cbbtcBalanceRaw: "50000000", // 0.5 cbBTC
    positionCount: 1,
    btcPrice: 100000,
    ...overrides,
  };
}

async function testRuleBasedDecisions() {
  console.log("\n📋 Rule-based decisions:");

  // Test: Should collect when has position
  {
    const ctx: AgentContext = {
      position: mockPosition(),
      marketData: { btcPrice: 100000, wbtcPrice: 100000, cbbtcPrice: 100000, wbtcCbbtcSpread: 0 },
      subscription: mockSubscription(),
      timestamp: Date.now(),
    };
    const result = ruleBasedDecisions(ctx);
    assert(result.decisions.length > 0, "Should produce decisions when has position");
    assert(result.decisions[0].action === "collect", "First action should be collect");
    assert(result.source === "rules", "Source should be rules");
  }

  // Test: Should hold when no position
  {
    const ctx: AgentContext = {
      position: mockPosition({ hasPosition: false, positionCount: 0 }),
      marketData: { btcPrice: 100000, wbtcPrice: 100000, cbbtcPrice: 100000, wbtcCbbtcSpread: 0 },
      subscription: mockSubscription({ positionTokenId: null }),
      timestamp: Date.now(),
    };
    const result = ruleBasedDecisions(ctx);
    assert(result.decisions.some((d) => d.action === "hold"), "Should hold when no position");
  }

  // Test: Should rebalance when ratio off
  {
    const ctx: AgentContext = {
      position: mockPosition({ wbtcBalanceRaw: "90000000", cbbtcBalanceRaw: "10000000" }),
      marketData: { btcPrice: 100000, wbtcPrice: 100000, cbbtcPrice: 100000, wbtcCbbtcSpread: 0 },
      subscription: mockSubscription(),
      timestamp: Date.now(),
    };
    const result = ruleBasedDecisions(ctx);
    assert(result.decisions.some((d) => d.action === "rebalance"), "Should rebalance when ratio is off");
  }

  // Test: Should suggest adjustRange on high spread
  {
    const ctx: AgentContext = {
      position: mockPosition(),
      marketData: { btcPrice: 100000, wbtcPrice: 100500, cbbtcPrice: 100000, wbtcCbbtcSpread: 0.6 },
      subscription: mockSubscription(),
      timestamp: Date.now(),
    };
    const result = ruleBasedDecisions(ctx);
    assert(result.decisions.some((d) => d.action === "adjustRange"), "Should adjustRange on high spread");
  }
}

async function testMarketData() {
  console.log("\n📊 Market data fetching:");

  const data = await fetchMarketData();
  assert(typeof data.btcPrice === "number" && data.btcPrice > 0, "BTC price should be positive number");
  assert(typeof data.wbtcPrice === "number" && data.wbtcPrice > 0, "WBTC price should be positive number");
  assert(typeof data.cbbtcPrice === "number" && data.cbbtcPrice > 0, "cbBTC price should be positive number");
  assert(typeof data.wbtcCbbtcSpread === "number", "Spread should be a number");
}

async function main() {
  console.log("🧪 PrismOS Agent Tests\n" + "=".repeat(40));

  await testRuleBasedDecisions();
  await testMarketData();

  console.log(`\n${"=".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
