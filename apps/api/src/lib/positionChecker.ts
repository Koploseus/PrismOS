/**
 * On-chain position & balance queries for smart accounts.
 */

import { createPublicClient, http, Address, formatUnits } from "viem";
import { CHAIN_CONFIGS } from "../../../../packages/shared/src/constants";
import type { StrategyConfig } from "../../../../packages/shared/src/types";

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const ERC721_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

export function createChainClient(chainId: number) {
  const chainConfig = CHAIN_CONFIGS[chainId];
  if (!chainConfig) {
    throw new Error(`Unsupported chainId ${chainId}`);
  }

  return createPublicClient({ transport: http(chainConfig.rpcUrl) });
}

export async function fetchBalance(
  client: ReturnType<typeof createChainClient>,
  token: Address,
  account: Address
): Promise<bigint> {
  return client.readContract({
    address: token,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account],
  });
}

export async function fetchNFTBalance(
  client: ReturnType<typeof createChainClient>,
  account: Address,
  positionManager: Address
): Promise<bigint> {
  try {
    return await client.readContract({
      address: positionManager,
      abi: ERC721_ABI,
      functionName: "balanceOf",
      args: [account],
    });
  } catch {
    return 0n;
  }
}

export async function fetchBTCPrice(): Promise<number> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
    );
    const data = await res.json();
    return data.bitcoin?.usd ?? 100000;
  } catch {
    return 100000;
  }
}

export interface PositionSnapshot {
  hasPosition: boolean;
  walletValueUsd: number;
  token0Balance: bigint;
  token1Balance: bigint;
  token0Address: Address;
  token1Address: Address;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  positionCount: number;
  btcPrice: number;
}

export async function checkSmartAccountPosition(
  address: Address,
  strategy: StrategyConfig
): Promise<PositionSnapshot> {
  const client = createChainClient(strategy.chainId);

  const [token0Balance, token1Balance, lpNftCount, btcPrice] = await Promise.all([
    fetchBalance(client, strategy.token0, address),
    fetchBalance(client, strategy.token1, address),
    fetchNFTBalance(client, address, strategy.positionManager),
    fetchBTCPrice(),
  ]);

  const token0Amount = Number(formatUnits(token0Balance, strategy.token0Decimals));
  const token1Amount = Number(formatUnits(token1Balance, strategy.token1Decimals));
  const walletValueUsd = (token0Amount + token1Amount) * btcPrice;
  const positionCount = Number(lpNftCount);

  return {
    hasPosition: positionCount > 0,
    walletValueUsd,
    token0Balance,
    token1Balance,
    token0Address: strategy.token0,
    token1Address: strategy.token1,
    token0Symbol: strategy.token0Symbol,
    token1Symbol: strategy.token1Symbol,
    token0Decimals: strategy.token0Decimals,
    token1Decimals: strategy.token1Decimals,
    positionCount,
    btcPrice,
  };
}
