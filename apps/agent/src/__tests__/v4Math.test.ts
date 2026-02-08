/**
 * v4Math unit tests
 *
 * Tests TickMath port, liquidity calculations, and swap amount computation
 * against known Uniswap V4 reference values.
 */

import {
  getSqrtPriceAtTick,
  amountsForLiquidity,
  liquidityForAmounts,
  computeSwapAmount,
  fullRangeTicks,
  alignTickDown,
  alignTickUp,
  Q96,
  MIN_TICK,
  MAX_TICK,
} from "../v4Math.js";

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

function assertClose(a: bigint, b: bigint, tolerance: bigint, message: string) {
  const diff = a > b ? a - b : b - a;
  if (diff <= tolerance) {
    console.log(`  ✅ ${message} (diff=${diff})`);
    passed++;
  } else {
    console.error(`  ❌ ${message} (expected ~${b}, got ${a}, diff=${diff}, tol=${tolerance})`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// TickMath tests — reference values from Uniswap v4-core
// ---------------------------------------------------------------------------

function testTickMath() {
  console.log("\n📐 TickMath.getSqrtPriceAtTick:");

  // tick=0 → sqrtPriceX96 = 2^96 = Q96
  const p0 = getSqrtPriceAtTick(0);
  assert(p0 === Q96, `tick=0 → sqrtP=Q96`);

  // tick=1 → slightly above Q96
  const p1 = getSqrtPriceAtTick(1);
  assert(p1 > Q96, `tick=1 → sqrtP > Q96`);

  // tick=-1 → slightly below Q96
  const pm1 = getSqrtPriceAtTick(-1);
  assert(pm1 < Q96, `tick=-1 → sqrtP < Q96`);

  // Reference: MAX_TICK sqrtPriceX96 = 1461446703485210103287273052203988822378723970342
  const pMax = getSqrtPriceAtTick(MAX_TICK);
  assert(pMax === 1461446703485210103287273052203988822378723970342n,
    `MAX_TICK → known sqrtP`);

  // Reference: MIN_TICK sqrtPriceX96 = 4295128739
  const pMin = getSqrtPriceAtTick(MIN_TICK);
  assert(pMin === 4295128739n, `MIN_TICK → known sqrtP`);

  // tick=-191138 (our PAXG/USDC pool) — should be positive and less than Q96
  const pPool = getSqrtPriceAtTick(-191138);
  assert(pPool > 0n, `tick=-191138 → positive sqrtP`);
  assert(pPool < Q96, `tick=-191138 → sqrtP < Q96`);

  // Symmetry: getSqrtPriceAtTick(t) * getSqrtPriceAtTick(-t) ≈ Q96^2
  const p100 = getSqrtPriceAtTick(100);
  const pm100 = getSqrtPriceAtTick(-100);
  const product = (p100 * pm100) / Q96;
  assertClose(product, Q96, Q96 / 1000n, "tick symmetry: p(100)*p(-100) ≈ Q96^2");

  // Monotonicity: higher tick → higher sqrtPrice
  const ticks = [-200000, -100000, -50000, 0, 50000, 100000, 200000];
  let lastP = 0n;
  let monotonic = true;
  for (const t of ticks) {
    const p = getSqrtPriceAtTick(t);
    if (p <= lastP) { monotonic = false; break; }
    lastP = p;
  }
  assert(monotonic, "sqrtPrice is monotonically increasing with tick");
}

// ---------------------------------------------------------------------------
// Tick alignment tests
// ---------------------------------------------------------------------------

function testTickAlignment() {
  console.log("\n📏 Tick alignment:");

  assert(alignTickDown(100, 60) === 60, "alignTickDown(100, 60) = 60");
  assert(alignTickDown(120, 60) === 120, "alignTickDown(120, 60) = 120");
  assert(alignTickDown(-100, 60) === -120, "alignTickDown(-100, 60) = -120");
  assert(alignTickDown(-120, 60) === -120, "alignTickDown(-120, 60) = -120");

  assert(alignTickUp(100, 60) === 120, "alignTickUp(100, 60) = 120");
  assert(alignTickUp(120, 60) === 120, "alignTickUp(120, 60) = 120");
  assert(alignTickUp(-100, 60) === -60, "alignTickUp(-100, 60) = -60");
  assert(alignTickUp(-120, 60) === -120, "alignTickUp(-120, 60) = -120");

  const ft = fullRangeTicks(60);
  assert(ft.tickLower === -887220, `fullRange(60).lower = -887220`);
  assert(ft.tickUpper === 887220, `fullRange(60).upper = 887220`);
  assert(ft.tickLower % 60 === 0, "fullRange(60).lower is multiple of 60");
  assert(ft.tickUpper % 60 === 0, "fullRange(60).upper is multiple of 60");

  const ft1 = fullRangeTicks(1);
  assert(ft1.tickLower === MIN_TICK, `fullRange(1).lower = MIN_TICK`);
  assert(ft1.tickUpper === MAX_TICK, `fullRange(1).upper = MAX_TICK`);
}

// ---------------------------------------------------------------------------
// Liquidity math tests
// ---------------------------------------------------------------------------

function testLiquidityMath() {
  console.log("\n💧 Liquidity math:");

  // At tick=0 (price=1:1), full range, amounts should be symmetric
  const sqrtP0 = getSqrtPriceAtTick(0);
  const liq = 10n ** 18n;
  const { amount0, amount1 } = amountsForLiquidity(sqrtP0, -887220, 887220, liq);
  assert(amount0 > 0n, `Full range at tick=0: amount0 > 0`);
  assert(amount1 > 0n, `Full range at tick=0: amount1 > 0`);
  const ratio = Number(amount0) / Number(amount1);
  assert(ratio > 0.5 && ratio < 2.0, `Full range at tick=0: ratio ≈ 1 (got ${ratio.toFixed(3)})`);

  // Round-trip: liquidityForAmounts → amountsForLiquidity
  const liqComputed = liquidityForAmounts(sqrtP0, -887220, 887220, amount0, amount1);
  assertClose(liqComputed, liq, 2n, "Round-trip: liquidityForAmounts ≈ original");

  // Edge case: price below range → all token0
  const sqrtPLow = getSqrtPriceAtTick(-500000);
  const { amount0: a0Low, amount1: a1Low } = amountsForLiquidity(sqrtPLow, -100, 100, liq);
  assert(a0Low > 0n, "Below range [-100,100] at tick=-500000: amount0 > 0");
  assert(a1Low === 0n, "Below range [-100,100] at tick=-500000: amount1 = 0");

  // Edge case: price above range → all token1
  const sqrtPHigh = getSqrtPriceAtTick(500000);
  const { amount0: a0High, amount1: a1High } = amountsForLiquidity(sqrtPHigh, -100, 100, liq);
  assert(a0High === 0n, "Above range [-100,100] at tick=500000: amount0 = 0");
  assert(a1High > 0n, "Above range [-100,100] at tick=500000: amount1 > 0");

  // PAXG/USDC scenario: tick=-191138, full range
  const sqrtPPaxg = getSqrtPriceAtTick(-191138);
  const paxgAmts = amountsForLiquidity(sqrtPPaxg, -887220, 887220, liq);
  assert(paxgAmts.amount0 > 0n, "PAXG/USDC: amount0 (PAXG) > 0");
  assert(paxgAmts.amount1 > 0n, "PAXG/USDC: amount1 (USDC) > 0");
  // At tick=-191138, we're well below 0 so we expect more token0 than token1 (in units)
  console.log(`    ℹ️  PAXG/USDC amounts: a0=${paxgAmts.amount0}, a1=${paxgAmts.amount1}`);
}

// ---------------------------------------------------------------------------
// Swap amount computation tests
// ---------------------------------------------------------------------------

function testSwapAmount() {
  console.log("\n🔄 Swap amount computation:");

  // At tick=0, full range, should swap ~50% (since price = 1:1)
  const sqrtP0 = getSqrtPriceAtTick(0);
  const totalUSDC = 1_000_000n; // 1 USDC (6 decimals)
  const swap0 = computeSwapAmount(totalUSDC, sqrtP0, -887220, 887220, 0n);
  const pct0 = (Number(swap0) / Number(totalUSDC)) * 100;
  assert(pct0 > 40 && pct0 < 60, `tick=0 full range: swap ≈ 50% (got ${pct0.toFixed(1)}%)`);

  // For a NARROW range above current price: need all token1, swap 0
  const swapAbove = computeSwapAmount(totalUSDC, sqrtP0, 1000, 2000, 0n);
  assert(swapAbove === totalUSDC, "Narrow range ABOVE current tick: swap = 100% (need only token0 for this range)");

  // For a NARROW range below current price: need all token0, swap 100%
  const swapBelow = computeSwapAmount(totalUSDC, sqrtP0, -2000, -1000, 0n);
  assert(swapBelow === 0n, "Narrow range BELOW current tick: swap = 0% (need only token1 for this range)");

  // PAXG/USDC at tick=-191138: compute realistic swap
  const sqrtPPaxg = getSqrtPriceAtTick(-191138);
  const totalPaxgUSDC = 100_000_000n; // 100 USDC
  const swapPaxg = computeSwapAmount(totalPaxgUSDC, sqrtPPaxg, -887220, 887220, 50n);
  const pctPaxg = (Number(swapPaxg) / Number(totalPaxgUSDC)) * 100;
  assert(swapPaxg > 0n, `PAXG/USDC: swap > 0`);
  assert(swapPaxg < totalPaxgUSDC, `PAXG/USDC: swap < total`);
  console.log(`    ℹ️  PAXG/USDC swap: ${pctPaxg.toFixed(1)}% of 100 USDC → PAXG`);

  // Fee buffer should reduce swap amount
  const swapNoFee = computeSwapAmount(totalUSDC, sqrtP0, -887220, 887220, 0n);
  const swapWithFee = computeSwapAmount(totalUSDC, sqrtP0, -887220, 887220, 100n);
  assert(swapWithFee < swapNoFee, "Fee buffer reduces swap amount");

  // Zero total USDC → zero swap
  const swapZero = computeSwapAmount(0n, sqrtP0, -887220, 887220, 0n);
  assert(swapZero === 0n, "Zero USDC → zero swap");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("🧮 v4Math Unit Tests\n" + "=".repeat(40));

  testTickMath();
  testTickAlignment();
  testLiquidityMath();
  testSwapAmount();

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
