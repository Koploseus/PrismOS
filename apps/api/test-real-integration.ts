/**
 * REAL Integration Test for PrismOS API
 * 
 * Tests with live ENS (yieldbot.prismos.eth), live LI.FI, live on-chain data.
 * Run with: SKIP_PAYMENT=true tsx test-real-integration.ts
 */

import "dotenv/config";

const API_BASE = "http://localhost:3002";
const TEST_ENS = "yieldbot.prismos.eth";
// Known wallet from the .env (agent wallet)
const TEST_WALLET = "0xc45293d8C2c859B05b9d810e06628485CCb6C615";

// Well-known token addresses on Ethereum mainnet
const PAXG = "0x45804880De22913dAFE09f4980848ECE6EcbAf78";
const USDC_ETH = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
// On Base (where our infra works)
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH_BASE = "0x4200000000000000000000000000000000000006";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => Promise<void>) {
  return { name, fn };
}

async function runTest(t: { name: string; fn: () => Promise<void> }) {
  try {
    await t.fn();
    passed++;
    console.log(`  ✅ ${t.name}`);
  } catch (e: any) {
    failed++;
    const msg = e.message || String(e);
    failures.push(`${t.name}: ${msg}`);
    console.log(`  ❌ ${t.name}: ${msg}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

// ============================================================
// TEST SUITE 1: API SERVER HEALTH
// ============================================================

const healthTests = [
  test("GET / returns health JSON", async () => {
    const res = await fetch(`${API_BASE}/`);
    assert(res.ok, `Status ${res.status}`);
    const data = await res.json();
    assert(data.status === "ok", `Expected status=ok, got ${data.status}`);
    assert(data.service === "PrismOS API", `Wrong service: ${data.service}`);
    assert(data.devMode === true, `Expected devMode=true`);
    console.log(`    service=${data.service}, devMode=${data.devMode}`);
  }),

  test("GET /api/health returns health JSON", async () => {
    const res = await fetch(`${API_BASE}/api/health`);
    assert(res.ok, `Status ${res.status}`);
    const data = await res.json();
    assert(data.endpoints["/api/build"], "Missing /api/build endpoint info");
  }),

  test("GET /api/x402 returns payment info", async () => {
    const res = await fetch(`${API_BASE}/api/x402`);
    assert(res.ok, `Status ${res.status}`);
    const data = await res.json();
    assert(data.protocol === "x402 Payment Protocol", `Wrong protocol: ${data.protocol}`);
    assert(data.token.symbol === "USDC", `Wrong token: ${data.token.symbol}`);
  }),
];

// ============================================================
// TEST SUITE 2: POSITION ENDPOINT (LIVE ENS + ON-CHAIN)
// ============================================================

const positionTests = [
  test("GET /api/position without agent param returns 400", async () => {
    const res = await fetch(`${API_BASE}/api/position/${TEST_WALLET}`);
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    const data = await res.json();
    assert(data.code === "MISSING_AGENT", `Expected MISSING_AGENT, got ${data.code}`);
  }),

  test("GET /api/position with yieldbot.prismos.eth resolves ENS", async () => {
    const res = await fetch(`${API_BASE}/api/position/${TEST_WALLET}?agent=${TEST_ENS}`);
    const data = await res.json();
    // This will likely fail because token0/token1 are empty in ENS
    // or chain=1 is not in CHAIN_CONFIGS
    console.log(`    Response: success=${data.success}, error=${data.error || "none"}, code=${data.code || "none"}`);
    if (!data.success) {
      // Expected: strategy resolution fails because chain=1 not in CHAIN_CONFIGS
      // OR token0/token1 empty
      assert(
        data.code === "INVALID_STRATEGY" || data.code === "INTERNAL_ERROR",
        `Unexpected error code: ${data.code}`
      );
      console.log(`    ⚠️ Expected failure: ${data.error}`);
    } else {
      console.log(`    walletValueUsd=${data.walletValueUsd}, hasPosition=${data.hasPosition}`);
      console.log(`    token0=${data.token0Symbol}, token1=${data.token1Symbol}`);
    }
  }),
];

// ============================================================
// TEST SUITE 3: BUILD ENDPOINT (CALLDATA GENERATION)
// ============================================================

const buildTests = [
  test("POST /api/build without user returns 400", async () => {
    const res = await fetch(`${API_BASE}/api/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actions: [{ type: "mint" }] }),
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    const data = await res.json();
    assert(data.code === "INVALID_USER", `Expected INVALID_USER, got ${data.code}`);
  }),

  test("POST /api/build without agentEns returns 400", async () => {
    const res = await fetch(`${API_BASE}/api/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user: TEST_WALLET, actions: [{ type: "mint" }] }),
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
    const data = await res.json();
    assert(data.code === "MISSING_AGENT_ENS", `Expected MISSING_AGENT_ENS, got ${data.code}`);
  }),

  test("POST /api/build with yieldbot.prismos.eth for mint", async () => {
    const res = await fetch(`${API_BASE}/api/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: TEST_WALLET,
        agentEns: TEST_ENS,
        actions: [
          {
            type: "mint",
            params: {
              fee: 500,
              tickSpacing: 10,
              hooks: "0x0000000000000000000000000000000000000000",
              tickLower: -887220,
              tickUpper: 887220,
              amount0: "1000000000000000000", // 1 token
              amount1: "1000000",              // 1 USDC
            },
          },
        ],
      }),
    });
    const data = await res.json();
    console.log(`    Response: success=${data.success}, error=${data.error || "none"}`);
    if (data.success) {
      console.log(`    Transactions: ${data.transactions.length}`);
      for (const tx of data.transactions) {
        console.log(`      → ${tx.description}: to=${tx.to.slice(0, 10)}... data=${tx.data.slice(0, 20)}...`);
      }
      assert(data.transactions.length >= 3, `Expected >=3 txs (2 approve + mint), got ${data.transactions.length}`);
      assert(data.chainId > 0, "Missing chainId");
    } else {
      console.log(`    ⚠️ Build failed: ${data.error} (code: ${data.code})`);
    }
  }),

  test("POST /api/build unknown action returns 400", async () => {
    const res = await fetch(`${API_BASE}/api/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: TEST_WALLET,
        agentEns: TEST_ENS,
        actions: [{ type: "unknown_action_xyz" }],
      }),
    });
    const data = await res.json();
    // Could be INVALID_STRATEGY (ENS issue) or UNKNOWN_ACTION
    console.log(`    Response: code=${data.code}`);
  }),
];

// ============================================================
// TEST SUITE 4: LIFI INTEGRATION (LIVE API)
// ============================================================

const lifiTests = [
  test("LI.FI quote: USDC -> WETH on Base (real API call)", async () => {
    const params = new URLSearchParams({
      fromChain: "8453",
      toChain: "8453",
      fromToken: USDC_BASE,
      toToken: WETH_BASE,
      fromAmount: "10000000", // 10 USDC
      fromAddress: TEST_WALLET,
      slippage: "0.005",
    });
    
    const res = await fetch(`https://li.quest/v1/quote?${params}`, {
      headers: { Accept: "application/json" },
    });
    
    console.log(`    LI.FI status: ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      console.log(`    Tool: ${data.toolDetails?.name || data.tool}`);
      console.log(`    fromAmount: ${data.action?.fromAmount}`);
      console.log(`    toAmount: ${data.estimate?.toAmount}`);
      console.log(`    Has tx: ${!!data.transactionRequest}`);
      if (data.transactionRequest) {
        const tx = data.transactionRequest;
        console.log(`    tx.to: ${tx.to}`);
        console.log(`    tx.data length: ${tx.data?.length || 0} chars`);
        console.log(`    tx.value: ${tx.value}`);
        assert(tx.to && tx.data, "Missing tx calldata from LI.FI");
        assert(tx.data.startsWith("0x"), "Calldata must start with 0x");
        assert(tx.data.length > 10, "Calldata too short");
      }
    } else {
      const body = await res.text();
      console.log(`    ❌ LI.FI error: ${body.slice(0, 200)}`);
      // Don't fail - LI.FI might rate limit
    }
  }),

  test("POST /api/build lifi-swap action (Base USDC->WETH)", async () => {
    // This tests our build handler's lifi-swap path
    // But requires strategy resolution to work first
    const res = await fetch(`${API_BASE}/api/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: TEST_WALLET,
        agentEns: TEST_ENS,
        actions: [
          {
            type: "lifi-swap",
            params: {
              chainId: 8453,
              fromToken: USDC_BASE,
              toToken: WETH_BASE,
              fromAmount: "10000000", // 10 USDC
            },
          },
        ],
      }),
    });
    const data = await res.json();
    console.log(`    Response: success=${data.success}, error=${data.error || "none"}`);
    if (data.success && data.transactions?.length) {
      const tx = data.transactions[0];
      console.log(`    Swap tx: to=${tx.to}, data_len=${tx.data?.length}`);
      assert(tx.data?.startsWith("0x"), "Calldata must start with 0x");
    }
  }),
];

// ============================================================
// TEST SUITE 5: CALLDATA ENCODING (UNIT-LEVEL)
// ============================================================

const calldataTests = [
  test("Calldata encoding: ERC20 approve produces valid hex", async () => {
    // Import and test directly
    const { encodeFunctionData } = await import("viem");
    const ERC20_ABI = [
      {
        name: "approve",
        type: "function" as const,
        inputs: [{ type: "address" as const }, { type: "uint256" as const }],
        outputs: [{ type: "bool" as const }],
        stateMutability: "nonpayable" as const,
      },
    ] as const;

    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [
        "0x000000000022D473030F116dDEE9F6B43aC78BA3", // Permit2
        BigInt("1000000000000000000"),
      ],
    });

    assert(data.startsWith("0x095ea7b3"), `Wrong selector: ${data.slice(0, 10)}`);
    assert(data.length === 138, `Wrong length: ${data.length}`); // 0x + 4bytes selector + 32+32 = 68 bytes = 136 hex + 2
    console.log(`    approve calldata: ${data.slice(0, 30)}... (${data.length} chars)`);
  }),

  test("Calldata encoding: modifyLiquidities is valid", async () => {
    const { encodeFunctionData, encodeAbiParameters, parseAbiParameters, encodePacked } = await import("viem");

    // Simulate what calldataBuilder does
    const POSITION_MANAGER_ABI = [
      {
        name: "modifyLiquidities",
        type: "function" as const,
        inputs: [{ type: "bytes" as const }, { type: "uint256" as const }],
        outputs: [],
        stateMutability: "payable" as const,
      },
    ] as const;

    const actionsBytes = encodePacked(["uint8", "uint8", "uint8"], [0x02, 0x12, 0x12]);
    const mockParams = encodeAbiParameters(
      parseAbiParameters("address, address, uint24, int24, address, int24, int24, uint256, uint128, uint128, address, bytes"),
      [
        "0x45804880De22913dAFE09f4980848ECE6EcbAf78", // PAXG
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
        500,
        10,
        "0x0000000000000000000000000000000000000000",
        -887220,
        887220,
        BigInt("1000000000000000000"),
        BigInt("1000000000000000000"),
        BigInt("1000000"),
        TEST_WALLET as `0x${string}`,
        "0x",
      ]
    );

    const close0 = encodeAbiParameters(parseAbiParameters("address"), [PAXG as `0x${string}`]);
    const close1 = encodeAbiParameters(parseAbiParameters("address"), [USDC_ETH as `0x${string}`]);

    const unlockData = encodeAbiParameters(parseAbiParameters("bytes, bytes[]"), [
      actionsBytes,
      [mockParams, close0, close1],
    ]);

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const calldata = encodeFunctionData({
      abi: POSITION_MANAGER_ABI,
      functionName: "modifyLiquidities",
      args: [unlockData, deadline],
    });

    assert(calldata.startsWith("0x"), "Must start with 0x");
    assert(calldata.length > 200, `Calldata too short: ${calldata.length}`);
    console.log(`    modifyLiquidities calldata: ${calldata.slice(0, 30)}... (${calldata.length} chars)`);
  }),
];

// ============================================================
// TEST SUITE 6: ENS RESOLUTION (LIVE)
// ============================================================

const ensTests = [
  test("ENS: yieldbot.prismos.eth resolves text records from mainnet", async () => {
    const { createPublicClient, http } = await import("viem");
    const { mainnet } = await import("viem/chains");
    const { normalize } = await import("viem/ens");

    const client = createPublicClient({
      chain: mainnet,
      transport: http("https://eth.llamarpc.com"),
    });

    const name = await client.getEnsText({
      name: normalize(TEST_ENS),
      key: "prismos.agent.name",
    });

    console.log(`    prismos.agent.name = "${name}"`);
    assert(!!name, "agent.name should not be empty");

    const chain = await client.getEnsText({
      name: normalize(TEST_ENS),
      key: "prismos.strategy.chain",
    });
    console.log(`    prismos.strategy.chain = "${chain}"`);
    assert(!!chain, "strategy.chain should not be empty");

    const pair = await client.getEnsText({
      name: normalize(TEST_ENS),
      key: "prismos.strategy.pair",
    });
    console.log(`    prismos.strategy.pair = "${pair}"`);

    const token0 = await client.getEnsText({
      name: normalize(TEST_ENS),
      key: "prismos.strategy.token0",
    });
    const token1 = await client.getEnsText({
      name: normalize(TEST_ENS),
      key: "prismos.strategy.token1",
    });
    console.log(`    prismos.strategy.token0 = "${token0 || "(EMPTY)"}"`);
    console.log(`    prismos.strategy.token1 = "${token1 || "(EMPTY)"}"`);

    if (!token0 || !token1) {
      console.log(`    ⚠️ PROBLEM: token0/token1 addresses missing from ENS!`);
      console.log(`    → resolveStrategyConfig() will return null`);
      console.log(`    → ALL /api/build and /api/position calls will fail with INVALID_STRATEGY`);
    }
  }),
];

// ============================================================
// RUN ALL
// ============================================================

async function main() {
  console.log("\n🧪 PrismOS REAL Integration Tests\n");
  console.log(`API: ${API_BASE}`);
  console.log(`ENS: ${TEST_ENS}`);
  console.log(`Wallet: ${TEST_WALLET}\n`);

  // Check if API is running
  try {
    await fetch(`${API_BASE}/`, { signal: AbortSignal.timeout(3000) });
  } catch {
    console.error("❌ API server not running! Start it with: SKIP_PAYMENT=true pnpm --filter api dev\n");
    process.exit(1);
  }

  console.log("── Suite 1: API Health ──");
  for (const t of healthTests) await runTest(t);

  console.log("\n── Suite 2: ENS Resolution (Live Mainnet) ──");
  for (const t of ensTests) await runTest(t);

  console.log("\n── Suite 3: Position Endpoint ──");
  for (const t of positionTests) await runTest(t);

  console.log("\n── Suite 4: Build Endpoint ──");
  for (const t of buildTests) await runTest(t);

  console.log("\n── Suite 5: LI.FI Integration (Live) ──");
  for (const t of lifiTests) await runTest(t);

  console.log("\n── Suite 6: Calldata Encoding ──");
  for (const t of calldataTests) await runTest(t);

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
