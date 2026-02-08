/**
 * Uniswap V4 Math Utilities
 *
 * Pure BigInt math for concentrated liquidity calculations.
 * Port of Uniswap v4-core TickMath + LiquidityAmounts.
 *
 * All computations are in raw token units (no decimals adjustment).
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const Q96 = 2n ** 96n;
export const Q192 = 2n ** 192n;
export const MIN_TICK = -887272;
export const MAX_TICK = 887272;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mulDiv(a: bigint, b: bigint, denom: bigint): bigint {
  if (denom === 0n) throw new Error("mulDiv: division by zero");
  return (a * b) / denom;
}

function mulDivRoundingUp(a: bigint, b: bigint, denom: bigint): bigint {
  const result = mulDiv(a, b, denom);
  if ((a * b) % denom > 0n) return result + 1n;
  return result;
}

// ---------------------------------------------------------------------------
// TickMath — port of v4-core TickMath.getSqrtPriceAtTick (BigInt)
// ---------------------------------------------------------------------------

export function getSqrtPriceAtTick(tick: number): bigint {
  if (tick < MIN_TICK || tick > MAX_TICK) throw new Error(`InvalidTick: ${tick}`);

  const absTick = BigInt(tick < 0 ? -tick : tick);

  let price =
    (absTick & 0x1n) !== 0n
      ? 0xfffcb933bd6fad37aa2d162d1a594001n
      : 0x100000000000000000000000000000000n;

  if ((absTick & 0x2n) !== 0n) price = (price * 0xfff97272373d413259a46990580e213an) >> 128n;
  if ((absTick & 0x4n) !== 0n) price = (price * 0xfff2e50f5f656932ef12357cf3c7fdccn) >> 128n;
  if ((absTick & 0x8n) !== 0n) price = (price * 0xffe5caca7e10e4e61c3624eaa0941cd0n) >> 128n;
  if ((absTick & 0x10n) !== 0n) price = (price * 0xffcb9843d60f6159c9db58835c926644n) >> 128n;
  if ((absTick & 0x20n) !== 0n) price = (price * 0xff973b41fa98c081472e6896dfb254c0n) >> 128n;
  if ((absTick & 0x40n) !== 0n) price = (price * 0xff2ea16466c96a3843ec78b326b52861n) >> 128n;
  if ((absTick & 0x80n) !== 0n) price = (price * 0xfe5dee046a99a2a811c461f1969c3053n) >> 128n;
  if ((absTick & 0x100n) !== 0n) price = (price * 0xfcbe86c7900a88aedcffc83b479aa3a4n) >> 128n;
  if ((absTick & 0x200n) !== 0n) price = (price * 0xf987a7253ac413176f2b074cf7815e54n) >> 128n;
  if ((absTick & 0x400n) !== 0n) price = (price * 0xf3392b0822b70005940c7a398e4b70f3n) >> 128n;
  if ((absTick & 0x800n) !== 0n) price = (price * 0xe7159475a2c29b7443b29c7fa6e889d9n) >> 128n;
  if ((absTick & 0x1000n) !== 0n) price = (price * 0xd097f3bdfd2022b8845ad8f792aa5825n) >> 128n;
  if ((absTick & 0x2000n) !== 0n) price = (price * 0xa9f746462d870fdf8a65dc1f90e061e5n) >> 128n;
  if ((absTick & 0x4000n) !== 0n) price = (price * 0x70d869a156d2a1b890bb3df62baf32f7n) >> 128n;
  if ((absTick & 0x8000n) !== 0n) price = (price * 0x31be135f97d08fd981231505542fcfa6n) >> 128n;
  if ((absTick & 0x10000n) !== 0n) price = (price * 0x9aa508b5b7a84e1c677de54f3e99bc9n) >> 128n;
  if ((absTick & 0x20000n) !== 0n) price = (price * 0x5d6af8dedb81196699c329225ee604n) >> 128n;
  if ((absTick & 0x40000n) !== 0n) price = (price * 0x2216e584f5fa1ea926041bedfe98n) >> 128n;
  if ((absTick & 0x80000n) !== 0n) price = (price * 0x48a170391f7dc42444e8fa2n) >> 128n;

  if (tick > 0) price = ((1n << 256n) - 1n) / price;

  // Q128.128 → Q128.96, rounding up
  return (price + (2n ** 32n - 1n)) >> 32n;
}

// ---------------------------------------------------------------------------
// LiquidityAmounts — amount deltas per unit liquidity
// ---------------------------------------------------------------------------

/** Amount of token0 required for `liquidity` in range [sqrtA, sqrtB] at price sqrtP. */
function getAmount0Delta(sqrtA: bigint, sqrtB: bigint, liquidity: bigint): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  const numerator1 = liquidity << 96n;
  const numerator2 = sqrtB - sqrtA;
  return mulDiv(numerator1, numerator2, sqrtB) / sqrtA;
}

/** Amount of token1 required for `liquidity` in range [sqrtA, sqrtB] at price sqrtP. */
function getAmount1Delta(sqrtA: bigint, sqrtB: bigint, liquidity: bigint): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  return mulDiv(liquidity, sqrtB - sqrtA, Q96);
}

/**
 * Compute the amounts of token0 and token1 needed for a given liquidity
 * in the tick range [tickLower, tickUpper] at the current sqrtPriceX96.
 */
export function amountsForLiquidity(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  liquidity: bigint
): { amount0: bigint; amount1: bigint } {
  const sqrtA = getSqrtPriceAtTick(tickLower);
  const sqrtB = getSqrtPriceAtTick(tickUpper);

  if (sqrtPriceX96 <= sqrtA) {
    return { amount0: getAmount0Delta(sqrtA, sqrtB, liquidity), amount1: 0n };
  }
  if (sqrtPriceX96 >= sqrtB) {
    return { amount0: 0n, amount1: getAmount1Delta(sqrtA, sqrtB, liquidity) };
  }
  return {
    amount0: getAmount0Delta(sqrtPriceX96, sqrtB, liquidity),
    amount1: getAmount1Delta(sqrtA, sqrtPriceX96, liquidity),
  };
}

// ---------------------------------------------------------------------------
// Liquidity from amounts — inverse of amountsForLiquidity
// ---------------------------------------------------------------------------

/** Compute the maximum liquidity that can be obtained from given amounts. */
export function liquidityForAmounts(
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  amount0: bigint,
  amount1: bigint
): bigint {
  const sqrtA = getSqrtPriceAtTick(tickLower);
  const sqrtB = getSqrtPriceAtTick(tickUpper);

  if (sqrtPriceX96 <= sqrtA) {
    // All token0
    return liquidityForAmount0(sqrtA, sqrtB, amount0);
  }
  if (sqrtPriceX96 >= sqrtB) {
    // All token1
    return liquidityForAmount1(sqrtA, sqrtB, amount1);
  }
  // In range: take the minimum
  const liq0 = liquidityForAmount0(sqrtPriceX96, sqrtB, amount0);
  const liq1 = liquidityForAmount1(sqrtA, sqrtPriceX96, amount1);
  return liq0 < liq1 ? liq0 : liq1;
}

function liquidityForAmount0(sqrtA: bigint, sqrtB: bigint, amount0: bigint): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  const intermediate = mulDiv(sqrtA, sqrtB, Q96);
  return mulDiv(amount0, intermediate, sqrtB - sqrtA);
}

function liquidityForAmount1(sqrtA: bigint, sqrtB: bigint, amount1: bigint): bigint {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  return mulDiv(amount1, Q96, sqrtB - sqrtA);
}

// ---------------------------------------------------------------------------
// Swap amount calculation
// ---------------------------------------------------------------------------

/**
 * Compute how much USDC (token1) to swap into PAXG (token0) so that
 * the resulting portfolio matches the required ratio for the tick range.
 *
 * @param totalToken1 - Total USDC balance (raw, 6 decimals)
 * @param sqrtPriceX96 - Current pool sqrtPriceX96
 * @param tickLower - Lower tick of the target range
 * @param tickUpper - Upper tick of the target range
 * @param feeBufferBps - Reduce swap by this % to account for swap fees (default 50 = 0.5%)
 * @returns swapAmount in token1 raw units
 */
export function computeSwapAmount(
  totalToken1: bigint,
  sqrtPriceX96: bigint,
  tickLower: number,
  tickUpper: number,
  feeBufferBps: bigint = 50n
): bigint {
  // Get amounts for a reference liquidity to determine the ratio
  const L = 10n ** 18n;
  const { amount0, amount1 } = amountsForLiquidity(sqrtPriceX96, tickLower, tickUpper, L);

  // Edge cases: all one-sided
  if (amount0 === 0n) return 0n; // Above range: need only token1 (USDC)
  if (amount1 === 0n) return totalToken1; // Below range: need only token0 (PAXG)

  // priceX192 = sqrtPriceX96^2, representing token1/token0 in Q192
  const priceX192 = sqrtPriceX96 * sqrtPriceX96;

  // r * P (in Q192 numerator): amount0 * priceX192
  const numer = amount0 * priceX192;
  const denom = amount1 * Q192;

  // desiredToken1 = totalToken1 * denom / (denom + numer)
  // => swapAmount = totalToken1 - desiredToken1 = totalToken1 * numer / (denom + numer)
  let swapAmount = mulDiv(totalToken1, numer, denom + numer);

  // Reduce by fee buffer to avoid coming up short after swap fees/slippage
  swapAmount = mulDiv(swapAmount, 10_000n - feeBufferBps, 10_000n);

  return swapAmount;
}

// ---------------------------------------------------------------------------
// Tick alignment
// ---------------------------------------------------------------------------

/** Align tick down to nearest multiple of tickSpacing. */
export function alignTickDown(tick: number, tickSpacing: number): number {
  const mod = ((tick % tickSpacing) + tickSpacing) % tickSpacing;
  return tick - mod;
}

/** Align tick up to nearest multiple of tickSpacing. */
export function alignTickUp(tick: number, tickSpacing: number): number {
  const mod = ((tick % tickSpacing) + tickSpacing) % tickSpacing;
  return mod === 0 ? tick : tick + (tickSpacing - mod);
}

/**
 * Compute full-range ticks for a given tickSpacing.
 * These are the widest possible ticks that are multiples of tickSpacing.
 */
export function fullRangeTicks(tickSpacing: number): { tickLower: number; tickUpper: number } {
  return {
    tickLower: alignTickUp(MIN_TICK, tickSpacing), // e.g., -887220 for tickSpacing=60
    tickUpper: alignTickDown(MAX_TICK, tickSpacing), // e.g., 887220 for tickSpacing=60
  };
}
