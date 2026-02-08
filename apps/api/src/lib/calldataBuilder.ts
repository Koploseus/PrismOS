/**
 * Calldata builders for Uniswap V4 actions.
 */

import {
  Address,
  Hex,
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  parseAbiParameters,
} from "viem";
import type { StrategyConfig } from "../../../../packages/shared/src/types";

export const V4_ACTIONS = {
  INCREASE_LIQUIDITY: 0x00,
  MINT_POSITION: 0x02,
  BURN_POSITION: 0x03,
  INCREASE_LIQUIDITY_FROM_DELTAS: 0x04,
  MINT_POSITION_FROM_DELTAS: 0x05,
  DECREASE_LIQUIDITY: 0x01,
  SETTLE: 0x0b,
  SETTLE_ALL: 0x0c,
  SETTLE_PAIR: 0x0d,
  TAKE: 0x0e,
  TAKE_ALL: 0x0f,
  TAKE_PAIR: 0x11,
  CLOSE_CURRENCY: 0x12,
  CLEAR_OR_TAKE: 0x13,
  SWEEP: 0x14,
} as const;

export interface Call {
  to: Address;
  data: Hex;
  value: bigint;
}

export interface PoolKeyParams {
  fee: number;
  tickSpacing: number;
  hooks: `0x${string}`;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

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

export function encodePoolKey(strategy: StrategyConfig, poolKey: PoolKeyParams) {
  return {
    currency0: strategy.token0,
    currency1: strategy.token1,
    fee: poolKey.fee,
    tickSpacing: poolKey.tickSpacing,
    hooks: poolKey.hooks,
  };
}

export function encodeMintParams(
  strategy: StrategyConfig,
  poolKey: PoolKeyParams,
  tickLower: number,
  tickUpper: number,
  liquidity: bigint,
  amount0Max: bigint,
  amount1Max: bigint,
  owner: Address
): Hex {
  const pool = encodePoolKey(strategy, poolKey);
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

export function encodeMintFromDeltasParams(
  strategy: StrategyConfig,
  poolKey: PoolKeyParams,
  tickLower: number,
  tickUpper: number,
  amount0: bigint,
  amount1: bigint,
  owner: Address
): Hex {
  return encodeAbiParameters(
    parseAbiParameters(
      "address, address, uint24, int24, address, int24, int24, uint128, uint128, address, bytes"
    ),
    [
      strategy.token0,
      strategy.token1,
      poolKey.fee,
      poolKey.tickSpacing,
      poolKey.hooks,
      tickLower,
      tickUpper,
      amount0,
      amount1,
      owner,
      "0x",
    ]
  );
}

export function encodeIncreaseLiquidityParams(
  tokenId: bigint,
  liquidity: bigint,
  amount0Max: bigint,
  amount1Max: bigint
): Hex {
  return encodeAbiParameters(parseAbiParameters("uint256, uint256, uint128, uint128, bytes"), [
    tokenId,
    liquidity,
    amount0Max,
    amount1Max,
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

function resolvePoolKeyParams(params: Record<string, unknown>): PoolKeyParams {
  return {
    fee: (params.fee as number) ?? 3000,
    tickSpacing: (params.tickSpacing as number) ?? 60,
    hooks: ((params.hooks as `0x${string}`) ?? ZERO_ADDRESS) as `0x${string}`,
  };
}

export function buildMintAction(
  user: Address,
  params: Record<string, unknown>,
  strategy: StrategyConfig
): Call[] {
  const poolKey = resolvePoolKeyParams(params);
  const tickLower = (params.tickLower as number) ?? -887220;
  const tickUpper = (params.tickUpper as number) ?? 887220;
  const amount0 = BigInt((params.amount0 as string) ?? "0");
  const amount1 = BigInt((params.amount1 as string) ?? "0");
  const liquidity = params.liquidity
    ? BigInt(params.liquidity as string)
    : amount0 > 0n
      ? amount0
      : 1000n;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const maxUint160 = BigInt("0xffffffffffffffffffffffffffffffff");
  const expiration = Math.floor(Date.now() / 1000) + 86400 * 365;

  const maxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
  const approveAmount0 = amount0 > 0n ? amount0 : maxUint256;
  const approveAmount1 = amount1 > 0n ? amount1 : maxUint256;

  const calls: Call[] = [];

  calls.push({
    to: strategy.token0,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [strategy.permit2, approveAmount0],
    }),
    value: 0n,
  });
  calls.push({
    to: strategy.permit2,
    data: encodeFunctionData({
      abi: PERMIT2_ABI,
      functionName: "approve",
      args: [strategy.token0, strategy.positionManager, maxUint160, expiration],
    }),
    value: 0n,
  });

  calls.push({
    to: strategy.token1,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [strategy.permit2, approveAmount1],
    }),
    value: 0n,
  });
  calls.push({
    to: strategy.permit2,
    data: encodeFunctionData({
      abi: PERMIT2_ABI,
      functionName: "approve",
      args: [strategy.token1, strategy.positionManager, maxUint160, expiration],
    }),
    value: 0n,
  });

  const mintParams = encodeMintParams(
    strategy,
    poolKey,
    tickLower,
    tickUpper,
    liquidity,
    amount0,
    amount1,
    user
  );
  const close0 = encodeCloseCurrency(strategy.token0);
  const close1 = encodeCloseCurrency(strategy.token1);
  const unlockData = encodeUnlockData(
    [V4_ACTIONS.MINT_POSITION, V4_ACTIONS.CLOSE_CURRENCY, V4_ACTIONS.CLOSE_CURRENCY],
    [mintParams, close0, close1]
  );

  calls.push({
    to: strategy.positionManager,
    data: encodeFunctionData({
      abi: POSITION_MANAGER_ABI,
      functionName: "modifyLiquidities",
      args: [unlockData, deadline],
    }),
    value: 0n,
  });

  return calls;
}

export function buildMintFromDeltasAction(
  user: Address,
  params: Record<string, unknown>,
  strategy: StrategyConfig
): Call[] {
  const poolKey = resolvePoolKeyParams(params);
  const tickLower = (params.tickLower as number) ?? -887220;
  const tickUpper = (params.tickUpper as number) ?? 887220;
  const amount0 = BigInt((params.amount0 as string) ?? "0");
  const amount1 = BigInt((params.amount1 as string) ?? "0");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const maxUint160 = BigInt("0xffffffffffffffffffffffffffffffff");
  const maxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
  const expiration = Math.floor(Date.now() / 1000) + 86400 * 365;

  // For mint-from-deltas, approve maxUint256 so PositionManager can pull actual token balances
  const approve0 = amount0 > 0n ? amount0 : maxUint256;
  const approve1 = amount1 > 0n ? amount1 : maxUint256;

  const calls: Call[] = [];

  calls.push({
    to: strategy.token0,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [strategy.permit2, approve0],
    }),
    value: 0n,
  });
  calls.push({
    to: strategy.permit2,
    data: encodeFunctionData({
      abi: PERMIT2_ABI,
      functionName: "approve",
      args: [strategy.token0, strategy.positionManager, maxUint160, expiration],
    }),
    value: 0n,
  });

  calls.push({
    to: strategy.token1,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [strategy.permit2, approve1],
    }),
    value: 0n,
  });
  calls.push({
    to: strategy.permit2,
    data: encodeFunctionData({
      abi: PERMIT2_ABI,
      functionName: "approve",
      args: [strategy.token1, strategy.positionManager, maxUint160, expiration],
    }),
    value: 0n,
  });

  const mintParams = encodeMintFromDeltasParams(
    strategy,
    poolKey,
    tickLower,
    tickUpper,
    amount0,
    amount1,
    user
  );
  const close0 = encodeCloseCurrency(strategy.token0);
  const close1 = encodeCloseCurrency(strategy.token1);
  const unlockData = encodeUnlockData(
    [V4_ACTIONS.MINT_POSITION_FROM_DELTAS, V4_ACTIONS.CLOSE_CURRENCY, V4_ACTIONS.CLOSE_CURRENCY],
    [mintParams, close0, close1]
  );

  calls.push({
    to: strategy.positionManager,
    data: encodeFunctionData({
      abi: POSITION_MANAGER_ABI,
      functionName: "modifyLiquidities",
      args: [unlockData, deadline],
    }),
    value: 0n,
  });

  return calls;
}

export function buildIncreaseLiquidityAction(
  user: Address,
  params: Record<string, unknown>,
  strategy: StrategyConfig
): Call[] {
  const tokenId = BigInt((params.tokenId as string) ?? "0");
  const amount0 = BigInt((params.amount0 as string) ?? "0");
  const amount1 = BigInt((params.amount1 as string) ?? "0");
  const liquidity = BigInt((params.liquidity as string) ?? "0");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const maxUint160 = BigInt("0xffffffffffffffffffffffffffffffff");
  const expiration = Math.floor(Date.now() / 1000) + 86400 * 365;

  void user;
  const calls: Call[] = [];

  calls.push({
    to: strategy.token0,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [strategy.permit2, amount0],
    }),
    value: 0n,
  });
  calls.push({
    to: strategy.permit2,
    data: encodeFunctionData({
      abi: PERMIT2_ABI,
      functionName: "approve",
      args: [strategy.token0, strategy.positionManager, maxUint160, expiration],
    }),
    value: 0n,
  });
  calls.push({
    to: strategy.token1,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [strategy.permit2, amount1],
    }),
    value: 0n,
  });
  calls.push({
    to: strategy.permit2,
    data: encodeFunctionData({
      abi: PERMIT2_ABI,
      functionName: "approve",
      args: [strategy.token1, strategy.positionManager, maxUint160, expiration],
    }),
    value: 0n,
  });

  const increaseParams = encodeIncreaseLiquidityParams(tokenId, liquidity, amount0, amount1);
  const close0 = encodeCloseCurrency(strategy.token0);
  const close1 = encodeCloseCurrency(strategy.token1);
  const unlockData = encodeUnlockData(
    [V4_ACTIONS.INCREASE_LIQUIDITY, V4_ACTIONS.CLOSE_CURRENCY, V4_ACTIONS.CLOSE_CURRENCY],
    [increaseParams, close0, close1]
  );

  calls.push({
    to: strategy.positionManager,
    data: encodeFunctionData({
      abi: POSITION_MANAGER_ABI,
      functionName: "modifyLiquidities",
      args: [unlockData, deadline],
    }),
    value: 0n,
  });

  return calls;
}

export function buildCollectAction(
  user: Address,
  params: Record<string, unknown>,
  strategy: StrategyConfig
): Call[] {
  const tokenId = BigInt((params.tokenId as string) ?? "0");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const decreaseParams = encodeDecreaseLiquidityParams(tokenId, 0n, 0n, 0n);
  const takeParams = encodeTakePair(strategy.token0, strategy.token1, user);
  const unlockData = encodeUnlockData(
    [V4_ACTIONS.DECREASE_LIQUIDITY, V4_ACTIONS.TAKE_PAIR],
    [decreaseParams, takeParams]
  );

  return [
    {
      to: strategy.positionManager,
      data: encodeFunctionData({
        abi: POSITION_MANAGER_ABI,
        functionName: "modifyLiquidities",
        args: [unlockData, deadline],
      }),
      value: 0n,
    },
  ];
}

export function buildWithdrawAction(
  user: Address,
  params: Record<string, unknown>,
  strategy: StrategyConfig
): Call[] {
  const tokenId = BigInt((params.tokenId as string) ?? "0");
  const liquidity = BigInt((params.liquidity as string) ?? "0");
  const percentage = (params.percentage as number) ?? 100;
  const actualLiquidity = percentage === 100 ? liquidity : (liquidity * BigInt(percentage)) / 100n;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const decreaseParams = encodeDecreaseLiquidityParams(tokenId, actualLiquidity, 0n, 0n);
  const takeParams = encodeTakePair(strategy.token0, strategy.token1, user);
  const unlockData = encodeUnlockData(
    [V4_ACTIONS.DECREASE_LIQUIDITY, V4_ACTIONS.TAKE_PAIR],
    [decreaseParams, takeParams]
  );

  return [
    {
      to: strategy.positionManager,
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
  const token = params.token as Address | undefined;
  if (!token) {
    throw new Error("Distribute action requires token");
  }
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
