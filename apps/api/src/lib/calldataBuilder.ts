/**
 * Calldata builders for Uniswap V4 actions.
 *
 * Extracted from handlers/build.ts so the cron loop can reuse them.
 */

import {
  Address,
  Hex,
  encodeFunctionData,
  encodeAbiParameters,
  parseAbiParameters,
  encodePacked,
} from "viem";
import {
  UNISWAP_V4_BASE,
  TOKENS_BASE,
  STRATEGIES_BASE,
} from "../../../../packages/shared/src/constants";

const CONTRACTS = UNISWAP_V4_BASE;
const TOKENS = TOKENS_BASE;
const POOL = STRATEGIES_BASE["wbtc-cbbtc"];

export const V4_ACTIONS = {
  MINT_POSITION: 0x02,
  DECREASE_LIQUIDITY: 0x01,
  TAKE_PAIR: 0x11,
  CLOSE_CURRENCY: 0x12,
} as const;

export interface Call {
  to: Address;
  data: Hex;
  value: bigint;
}

const ERC20_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    name: "transfer",
    type: "function",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

const POSITION_MANAGER_ABI = [
  {
    name: "modifyLiquidities",
    type: "function",
    inputs: [{ type: "bytes" }, { type: "uint256" }],
    outputs: [],
    stateMutability: "payable",
  },
] as const;

const PERMIT2_ABI = [
  {
    name: "approve",
    type: "function",
    inputs: [{ type: "address" }, { type: "address" }, { type: "uint160" }, { type: "uint48" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export function encodePoolKey() {
  return {
    currency0: POOL.token0,
    currency1: POOL.token1,
    fee: POOL.fee,
    tickSpacing: POOL.tickSpacing,
    hooks: POOL.hooks,
  };
}

export function encodeMintParams(
  tickLower: number,
  tickUpper: number,
  liquidity: bigint,
  amount0Max: bigint,
  amount1Max: bigint,
  owner: Address
): Hex {
  const pool = encodePoolKey();
  return encodeAbiParameters(
    parseAbiParameters(
      "address, address, uint24, int24, address, int24, int24, uint256, uint128, uint128, address, bytes"
    ),
    [
      pool.currency0,
      pool.currency1,
      pool.fee,
      pool.tickSpacing,
      pool.hooks,
      tickLower,
      tickUpper,
      liquidity,
      amount0Max,
      amount1Max,
      owner,
      "0x",
    ]
  );
}

export function encodeDecreaseLiquidityParams(
  tokenId: bigint,
  liquidity: bigint,
  amount0Min: bigint,
  amount1Min: bigint
): Hex {
  return encodeAbiParameters(parseAbiParameters("uint256, uint256, uint128, uint128, bytes"), [
    tokenId,
    liquidity,
    amount0Min,
    amount1Min,
    "0x",
  ]);
}

export function encodeCloseCurrency(currency: Address): Hex {
  return encodeAbiParameters(parseAbiParameters("address"), [currency]);
}

export function encodeTakePair(currency0: Address, currency1: Address, recipient: Address): Hex {
  return encodeAbiParameters(parseAbiParameters("address, address, address"), [
    currency0,
    currency1,
    recipient,
  ]);
}

export function encodeUnlockData(actions: number[], params: Hex[]): Hex {
  const actionsBytes = encodePacked(
    actions.map(() => "uint8" as const),
    actions
  );
  return encodeAbiParameters(parseAbiParameters("bytes, bytes[]"), [actionsBytes, params]);
}

export function buildMintAction(user: Address, params: Record<string, unknown>): Call[] {
  const tickLower = (params.tickLower as number) ?? POOL.recommendedTickRange?.lower ?? -100;
  const tickUpper = (params.tickUpper as number) ?? POOL.recommendedTickRange?.upper ?? 100;
  const amount0 = BigInt((params.amount0 as string) ?? "0");
  const amount1 = BigInt((params.amount1 as string) ?? "0");
  const liquidity = amount0 > 0n ? amount0 : 1000n;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const maxUint160 = BigInt("0xffffffffffffffffffffffffffffffff");
  const expiration = Math.floor(Date.now() / 1000) + 86400 * 365;

  const calls: Call[] = [];

  calls.push({
    to: POOL.token0,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [CONTRACTS.PERMIT2, amount0],
    }),
    value: 0n,
  });
  calls.push({
    to: CONTRACTS.PERMIT2,
    data: encodeFunctionData({
      abi: PERMIT2_ABI,
      functionName: "approve",
      args: [POOL.token0, CONTRACTS.POSITION_MANAGER, maxUint160, expiration],
    }),
    value: 0n,
  });

  calls.push({
    to: POOL.token1,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [CONTRACTS.PERMIT2, amount1],
    }),
    value: 0n,
  });
  calls.push({
    to: CONTRACTS.PERMIT2,
    data: encodeFunctionData({
      abi: PERMIT2_ABI,
      functionName: "approve",
      args: [POOL.token1, CONTRACTS.POSITION_MANAGER, maxUint160, expiration],
    }),
    value: 0n,
  });

  const mintParams = encodeMintParams(tickLower, tickUpper, liquidity, amount0, amount1, user);
  const close0 = encodeCloseCurrency(POOL.token0);
  const close1 = encodeCloseCurrency(POOL.token1);
  const unlockData = encodeUnlockData(
    [V4_ACTIONS.MINT_POSITION, V4_ACTIONS.CLOSE_CURRENCY, V4_ACTIONS.CLOSE_CURRENCY],
    [mintParams, close0, close1]
  );

  calls.push({
    to: CONTRACTS.POSITION_MANAGER,
    data: encodeFunctionData({
      abi: POSITION_MANAGER_ABI,
      functionName: "modifyLiquidities",
      args: [unlockData, deadline],
    }),
    value: 0n,
  });

  return calls;
}

export function buildCollectAction(user: Address, params: Record<string, unknown>): Call[] {
  const tokenId = BigInt((params.tokenId as string) ?? "0");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const decreaseParams = encodeDecreaseLiquidityParams(tokenId, 0n, 0n, 0n);
  const takeParams = encodeTakePair(POOL.token0, POOL.token1, user);
  const unlockData = encodeUnlockData(
    [V4_ACTIONS.DECREASE_LIQUIDITY, V4_ACTIONS.TAKE_PAIR],
    [decreaseParams, takeParams]
  );

  return [
    {
      to: CONTRACTS.POSITION_MANAGER,
      data: encodeFunctionData({
        abi: POSITION_MANAGER_ABI,
        functionName: "modifyLiquidities",
        args: [unlockData, deadline],
      }),
      value: 0n,
    },
  ];
}

export function buildWithdrawAction(user: Address, params: Record<string, unknown>): Call[] {
  const tokenId = BigInt((params.tokenId as string) ?? "0");
  const liquidity = BigInt((params.liquidity as string) ?? "0");
  const percentage = (params.percentage as number) ?? 100;
  const actualLiquidity = percentage === 100 ? liquidity : (liquidity * BigInt(percentage)) / 100n;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const decreaseParams = encodeDecreaseLiquidityParams(tokenId, actualLiquidity, 0n, 0n);
  const takeParams = encodeTakePair(POOL.token0, POOL.token1, user);
  const unlockData = encodeUnlockData(
    [V4_ACTIONS.DECREASE_LIQUIDITY, V4_ACTIONS.TAKE_PAIR],
    [decreaseParams, takeParams]
  );

  return [
    {
      to: CONTRACTS.POSITION_MANAGER,
      data: encodeFunctionData({
        abi: POSITION_MANAGER_ABI,
        functionName: "modifyLiquidities",
        args: [unlockData, deadline],
      }),
      value: 0n,
    },
  ];
}

export function buildApproveAction(params: Record<string, unknown>): Call[] {
  const token = params.token as Address;
  const spender = params.spender as Address;
  const amount = BigInt((params.amount as string) ?? String(2n ** 256n - 1n));

  return [
    {
      to: token,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender, amount],
      }),
      value: 0n,
    },
  ];
}

export function buildDistributeAction(params: Record<string, unknown>): Call[] {
  const destination = params.destination as Address;
  const token = (params.token ?? TOKENS.USDC) as Address;
  const amount = BigInt((params.amount as string) ?? "0");

  return [
    {
      to: token,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [destination, amount],
      }),
      value: 0n,
    },
  ];
}
