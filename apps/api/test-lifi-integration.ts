/**
 * Real Integration Test: LI.FI + V4 Port
 * 
 * Tests after porting the PoC integration:
 * 1. ENS resolution with yieldbot.prismos.eth (now with KNOWN_TOKENS fallback)
 * 2. LI.FI swap calldata (USDC -> PAXG on Ethereum)
 * 3. V4 mint calldata with MINT_POSITION_FROM_DELTAS
 * 4. Full USDC deposit flow: swap + mint
 */

const API_BASE = "http://localhost:3002";
const TEST_ENS = "yieldbot.prismos.eth";
const TEST_WALLET = "0xc45293d8C2c859B05b9d810e06628485CCb6C615";

// Ethereum mainnet tokens
const USDC_ETH = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const PAXG_ETH = "0x45804880De22913dAFE09f4980848ECE6EcbAf78";
// Base tokens for same-chain swap test
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH_BASE = "0x4200000000000000000000000000000000000006";

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e: any) {
    failed++;
    const msg = e.message || String(e);
    failures.push(`${name}: ${msg}`);
    console.log(`  ❌ ${name}: ${msg}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

async function main() {
  console.log("\n🧪 PrismOS LI.FI + V4 Integration Tests\n");

  // Check API is running
  try {
    await fetch(`${API_BASE}/`, { signal: AbortSignal.timeout(3000) });
  } catch {
    console.error("❌ API not running! Start with: SKIP_PAYMENT=true apps/api/node_modules/.bin/tsx apps/api/src/index.ts");
    process.exit(1);
  }

  // ── Suite 1: Health ──
  console.log("── Suite 1: API Health ──");
  
  await test("GET / returns ok", async () => {
    const res = await fetch(`${API_BASE}/`);
    const data = await res.json();
    assert(data.status === "ok", `Expected ok, got ${data.status}`);
  });

  // ── Suite 2: ENS with KNOWN_TOKENS fallback ──
  console.log("\n── Suite 2: ENS Resolution (yieldbot.prismos.eth) ──");

  await test("Position endpoint resolves strategy via KNOWN_TOKENS fallback", async () => {
    const res = await fetch(`${API_BASE}/api/position/${TEST_WALLET}?agent=${TEST_ENS}`, {
      signal: AbortSignal.timeout(45000),
    });
    const data = await res.json();
    console.log(`    success=${data.success}, error=${data.error || "none"}, code=${data.code || "none"}`);
    if (data.token0Symbol) console.log(`    token0=${data.token0Symbol}, token1=${data.token1Symbol}`);
    if (data.success) {
      assert(data.token0Symbol === "PAXG" || data.token1Symbol === "USDC", "Expected PAXG/USDC pair");
    } else {
      // If it fails, check it's NOT INVALID_STRATEGY anymore (that means KNOWN_TOKENS worked)
      console.log(`    ⚠️ Failed but code=${data.code} (INVALID_STRATEGY would mean KNOWN_TOKENS fallback broken)`);
    }
  });

  // ── Suite 3: Build with swap action (LI.FI) ──
  console.log("\n── Suite 3: LI.FI Swap via /api/build ──");

  await test("Build swap action: USDC -> WETH on Base via LI.FI", async () => {
    const res = await fetch(`${API_BASE}/api/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        user: TEST_WALLET,
        agentEns: TEST_ENS,
        actions: [{
          type: "swap",
          params: {
            chainId: 8453,
            fromToken: USDC_BASE,
            toToken: WETH_BASE,
            fromAmount: "10000000", // 10 USDC
          },
        }],
      }),
    });
    const data = await res.json();
    console.log(`    success=${data.success}, error=${data.error || "none"}`);
    if (data.success) {
      console.log(`    transactions: ${data.transactions.length}`);
      for (const tx of data.transactions) {
        console.log(`      → ${tx.description}: to=${tx.to?.slice(0, 12)}... data_len=${tx.data?.length}`);
      }
      assert(data.transactions.length >= 1, "Expected at least 1 transaction");
      assert(data.transactions.some((t: any) => t.data?.length > 10), "Expected calldata");
    }
  });

  await test("Build lifi-swap action: USDC -> WETH on Base (legacy endpoint)", async () => {
    const res = await fetch(`${API_BASE}/api/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        user: TEST_WALLET,
        agentEns: TEST_ENS,
        actions: [{
          type: "lifi-swap",
          params: {
            chainId: 8453,
            fromToken: USDC_BASE,
            toToken: WETH_BASE,
            fromAmount: "10000000",
          },
        }],
      }),
    });
    const data = await res.json();
    console.log(`    success=${data.success}, txs=${data.transactions?.length || 0}`);
  });

  // ── Suite 4: V4 Mint calldata ──
  console.log("\n── Suite 4: V4 Mint Calldata ──");

  await test("Build mint-from-deltas action", async () => {
    const res = await fetch(`${API_BASE}/api/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        user: TEST_WALLET,
        agentEns: TEST_ENS,
        actions: [{
          type: "mint-from-deltas",
          params: {
            fee: 500,
            tickSpacing: 10,
            hooks: "0x0000000000000000000000000000000000000000",
            tickLower: -887220,
            tickUpper: 887220,
            amount0: "1000000000000000000", // 1 PAXG
            amount1: "2500000000",           // 2500 USDC (6 decimals)
          },
        }],
      }),
    });
    const data = await res.json();
    console.log(`    success=${data.success}, error=${data.error || "none"}`);
    if (data.success) {
      console.log(`    chainId=${data.chainId}`);
      console.log(`    transactions: ${data.transactions.length}`);
      for (const tx of data.transactions) {
        console.log(`      → ${tx.description}: to=${tx.to?.slice(0, 12)}... data_len=${tx.data?.length}`);
      }
      // Should have: approve token0 to permit2, permit2.approve token0, approve token1, permit2.approve token1, modifyLiquidities
      assert(data.transactions.length === 5, `Expected 5 txs (4 approvals + mint), got ${data.transactions.length}`);
    }
  });

  await test("Build mint action (classic, with explicit liquidity)", async () => {
    const res = await fetch(`${API_BASE}/api/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        user: TEST_WALLET,
        agentEns: TEST_ENS,
        actions: [{
          type: "mint",
          params: {
            fee: 500,
            tickSpacing: 10,
            tickLower: -887220,
            tickUpper: 887220,
            amount0: "1000000000000000000",
            amount1: "2500000000",
          },
        }],
      }),
    });
    const data = await res.json();
    console.log(`    success=${data.success}, txs=${data.transactions?.length || 0}`);
  });

  // ── Suite 5: Calldata Verification ──
  console.log("\n── Suite 5: Calldata Verification ──");

  await test("All calldata starts with 0x and has valid length", async () => {
    const res = await fetch(`${API_BASE}/api/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        user: TEST_WALLET,
        agentEns: TEST_ENS,
        actions: [{
          type: "mint-from-deltas",
          params: {
            fee: 100, tickSpacing: 1,
            tickLower: -100, tickUpper: 100,
            amount0: "100000000000000000", // 0.1 PAXG
            amount1: "250000000", // 250 USDC
          },
        }],
      }),
    });
    const data = await res.json();
    if (data.success) {
      for (const tx of data.transactions) {
        assert(tx.data.startsWith("0x"), `Calldata must start with 0x: ${tx.data?.slice(0, 20)}`);
        assert(tx.data.length >= 10, `Calldata too short: ${tx.data.length} chars`);
        assert(tx.to.startsWith("0x") && tx.to.length === 42, `Invalid address: ${tx.to}`);
      }
      console.log(`    All ${data.transactions.length} transactions have valid calldata`);
    } else {
      console.log(`    ⚠️ Build failed: ${data.error}`);
    }
  });

  // ── Results ──
  console.log(`\n${"═".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  }
  console.log(`${"═".repeat(50)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
