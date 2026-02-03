/**
 * POST /api/build
 * 
 * Builds calldata for Uniswap V4 actions.
 * Agent signs and submits - we never touch funds.
 */

import { Context } from 'hono';
import { Address, Hex, encodeFunctionData, encodeAbiParameters, parseAbiParameters, encodePacked } from 'viem';
import { generateReceipt } from '../middleware/x402';
import { UNISWAP_V4_BASE, TOKENS_BASE, STRATEGIES_BASE } from '../../../../packages/shared/src/constants';

const CHAIN_ID = 8453;
const CONTRACTS = UNISWAP_V4_BASE;
const TOKENS = TOKENS_BASE;
const POOL = STRATEGIES_BASE['wbtc-cbbtc'];

const V4_ACTIONS = {
  MINT_POSITION: 0x02,
  DECREASE_LIQUIDITY: 0x01,
  TAKE_PAIR: 0x11,
  CLOSE_CURRENCY: 0x12,
} as const;

interface BuildRequest {
  user: Address;
  actions: Action[];
}

interface Action {
  type: 'mint' | 'deposit' | 'withdraw' | 'collect' | 'compound' | 'approve' | 'distribute';
  params?: Record<string, unknown>;
}

interface Transaction {
  to: Address;
  data: Hex;
  value: string;
  description: string;
}

const ERC20_ABI = [
  { name: 'approve', type: 'function', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
  { name: 'transfer', type: 'function', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

const POSITION_MANAGER_ABI = [
  { name: 'modifyLiquidities', type: 'function', inputs: [{ type: 'bytes' }, { type: 'uint256' }], outputs: [], stateMutability: 'payable' },
] as const;

const PERMIT2_ABI = [
  { name: 'approve', type: 'function', inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint160' }, { type: 'uint48' }], outputs: [], stateMutability: 'nonpayable' },
] as const;

function encodePoolKey() {
  return {
    currency0: POOL.token0,
    currency1: POOL.token1,
    fee: POOL.fee,
    tickSpacing: POOL.tickSpacing,
    hooks: POOL.hooks,
  };
}

function encodeMintParams(tickLower: number, tickUpper: number, liquidity: bigint, amount0Max: bigint, amount1Max: bigint, owner: Address): Hex {
  const pool = encodePoolKey();
  return encodeAbiParameters(
    parseAbiParameters('address, address, uint24, int24, address, int24, int24, uint256, uint128, uint128, address, bytes'),
    [pool.currency0, pool.currency1, pool.fee, pool.tickSpacing, pool.hooks, tickLower, tickUpper, liquidity, amount0Max, amount1Max, owner, '0x']
  );
}

function encodeDecreaseLiquidityParams(tokenId: bigint, liquidity: bigint, amount0Min: bigint, amount1Min: bigint): Hex {
  return encodeAbiParameters(
    parseAbiParameters('uint256, uint256, uint128, uint128, bytes'),
    [tokenId, liquidity, amount0Min, amount1Min, '0x']
  );
}

function encodeCloseCurrency(currency: Address): Hex {
  return encodeAbiParameters(parseAbiParameters('address'), [currency]);
}

function encodeTakePair(currency0: Address, currency1: Address, recipient: Address): Hex {
  return encodeAbiParameters(parseAbiParameters('address, address, address'), [currency0, currency1, recipient]);
}

function encodeUnlockData(actions: number[], params: Hex[]): Hex {
  const actionsBytes = encodePacked(actions.map(() => 'uint8' as const), actions);
  return encodeAbiParameters(parseAbiParameters('bytes, bytes[]'), [actionsBytes, params]);
}

function buildMintAction(user: Address, params: Record<string, unknown>): Transaction[] {
  const tickLower = (params.tickLower as number) ?? POOL.recommendedTickRange?.lower ?? -100;
  const tickUpper = (params.tickUpper as number) ?? POOL.recommendedTickRange?.upper ?? 100;
  const amount0 = BigInt((params.amount0 as string) ?? '0');
  const amount1 = BigInt((params.amount1 as string) ?? '0');
  const liquidity = amount0 > 0n ? amount0 : 1000n;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const maxUint160 = BigInt('0xffffffffffffffffffffffffffffffff');
  const expiration = Math.floor(Date.now() / 1000) + 86400 * 365;

  const txs: Transaction[] = [];

  // Approve WBTC → Permit2 → PositionManager
  txs.push({
    to: POOL.token0,
    data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [CONTRACTS.PERMIT2, amount0] }),
    value: '0',
    description: 'Approve WBTC to Permit2',
  });
  txs.push({
    to: CONTRACTS.PERMIT2,
    data: encodeFunctionData({ abi: PERMIT2_ABI, functionName: 'approve', args: [POOL.token0, CONTRACTS.POSITION_MANAGER, maxUint160, expiration] }),
    value: '0',
    description: 'Permit2: WBTC → PositionManager',
  });

  // Approve cbBTC → Permit2 → PositionManager
  txs.push({
    to: POOL.token1,
    data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [CONTRACTS.PERMIT2, amount1] }),
    value: '0',
    description: 'Approve cbBTC to Permit2',
  });
  txs.push({
    to: CONTRACTS.PERMIT2,
    data: encodeFunctionData({ abi: PERMIT2_ABI, functionName: 'approve', args: [POOL.token1, CONTRACTS.POSITION_MANAGER, maxUint160, expiration] }),
    value: '0',
    description: 'Permit2: cbBTC → PositionManager',
  });

  // Mint position
  const mintParams = encodeMintParams(tickLower, tickUpper, liquidity, amount0, amount1, user);
  const close0 = encodeCloseCurrency(POOL.token0);
  const close1 = encodeCloseCurrency(POOL.token1);
  const unlockData = encodeUnlockData([V4_ACTIONS.MINT_POSITION, V4_ACTIONS.CLOSE_CURRENCY, V4_ACTIONS.CLOSE_CURRENCY], [mintParams, close0, close1]);

  txs.push({
    to: CONTRACTS.POSITION_MANAGER,
    data: encodeFunctionData({ abi: POSITION_MANAGER_ABI, functionName: 'modifyLiquidities', args: [unlockData, deadline] }),
    value: '0',
    description: `Mint LP [${tickLower}, ${tickUpper}]`,
  });

  return txs;
}

function buildCollectAction(user: Address, params: Record<string, unknown>): Transaction[] {
  const tokenId = BigInt((params.tokenId as string) ?? '0');
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const decreaseParams = encodeDecreaseLiquidityParams(tokenId, 0n, 0n, 0n);
  const takeParams = encodeTakePair(POOL.token0, POOL.token1, user);
  const unlockData = encodeUnlockData([V4_ACTIONS.DECREASE_LIQUIDITY, V4_ACTIONS.TAKE_PAIR], [decreaseParams, takeParams]);

  return [{
    to: CONTRACTS.POSITION_MANAGER,
    data: encodeFunctionData({ abi: POSITION_MANAGER_ABI, functionName: 'modifyLiquidities', args: [unlockData, deadline] }),
    value: '0',
    description: `Collect fees #${tokenId}`,
  }];
}

function buildWithdrawAction(user: Address, params: Record<string, unknown>): Transaction[] {
  const tokenId = BigInt((params.tokenId as string) ?? '0');
  const liquidity = BigInt((params.liquidity as string) ?? '0');
  const percentage = (params.percentage as number) ?? 100;
  const actualLiquidity = percentage === 100 ? liquidity : (liquidity * BigInt(percentage)) / 100n;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  const decreaseParams = encodeDecreaseLiquidityParams(tokenId, actualLiquidity, 0n, 0n);
  const takeParams = encodeTakePair(POOL.token0, POOL.token1, user);
  const unlockData = encodeUnlockData([V4_ACTIONS.DECREASE_LIQUIDITY, V4_ACTIONS.TAKE_PAIR], [decreaseParams, takeParams]);

  return [{
    to: CONTRACTS.POSITION_MANAGER,
    data: encodeFunctionData({ abi: POSITION_MANAGER_ABI, functionName: 'modifyLiquidities', args: [unlockData, deadline] }),
    value: '0',
    description: `Withdraw ${percentage}% from #${tokenId}`,
  }];
}

function buildApproveAction(params: Record<string, unknown>): Transaction[] {
  const token = params.token as Address;
  const spender = params.spender as Address;
  const amount = BigInt((params.amount as string) ?? String(2n ** 256n - 1n));

  return [{
    to: token,
    data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'approve', args: [spender, amount] }),
    value: '0',
    description: `Approve ${token.slice(0, 8)}...`,
  }];
}

function buildDistributeAction(params: Record<string, unknown>): Transaction[] {
  const destination = params.destination as Address;
  const token = (params.token ?? TOKENS.USDC) as Address;
  const amount = BigInt((params.amount as string) ?? '0');

  return [{
    to: token,
    data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'transfer', args: [destination, amount] }),
    value: '0',
    description: `Transfer to ${destination.slice(0, 8)}...`,
  }];
}

export async function buildHandler(c: Context): Promise<Response> {
  try {
    const body = await c.req.json() as BuildRequest;

    if (!body.user?.startsWith('0x')) {
      return c.json({ success: false, error: 'Invalid user address', code: 'INVALID_USER' }, 400);
    }
    if (!body.actions?.length) {
      return c.json({ success: false, error: 'Actions required', code: 'NO_ACTIONS' }, 400);
    }

    const txs: Transaction[] = [];

    for (const action of body.actions) {
      const params = action.params ?? {};
      
      switch (action.type) {
        case 'mint':
        case 'deposit':
        case 'compound':
          txs.push(...buildMintAction(body.user, params));
          break;
        case 'collect':
          txs.push(...buildCollectAction(body.user, params));
          break;
        case 'withdraw':
          txs.push(...buildWithdrawAction(body.user, params));
          break;
        case 'approve':
          txs.push(...buildApproveAction(params));
          break;
        case 'distribute':
          txs.push(...buildDistributeAction(params));
          break;
        default:
          return c.json({ success: false, error: `Unknown action: ${action.type}`, code: 'UNKNOWN_ACTION' }, 400);
      }
    }

    return c.json({
      success: true,
      chainId: CHAIN_ID,
      transactions: txs,
      estimatedGas: String(100000 + txs.length * 80000),
      receipt: generateReceipt(c.get('paymentId'), '/api/build', 0.01, body.actions.map(a => a.type)),
    });

  } catch (error: unknown) {
    console.error('[build]', error);
    return c.json({ success: false, error: 'Internal error', code: 'INTERNAL_ERROR' }, 500);
  }
}
