/**
 * On-chain position & balance queries for smart accounts.
 *
 * Extracted from handlers/position.ts for reuse in the cron loop.
 */

import { createPublicClient, http, Address, formatUnits } from "viem";
import { base } from "viem/chains";
import { TOKENS_BASE, UNISWAP_V4_BASE } from "../../../../packages/shared/src/constants";

const RPC_URL = process.env.BASE_RPC || "https://mainnet.base.org";

export const TOKENS = {
  WBTC: { address: TOKENS_BASE.WBTC, decimals: 8 },
  CBBTC: { address: TOKENS_BASE.CBBTC, decimals: 8 },
  USDC: { address: TOKENS_BASE.USDC, decimals: 6 },
} as const;

export const POSITION_MANAGER = UNISWAP_V4_BASE.POSITION_MANAGER as Address;

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
  {
    name: "ownerOf",
    type: "function",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
] as const;

export function createBaseClient() {
  return createPublicClient({ chain: base, transport: http(RPC_URL) });
}

export async function fetchBalance(
  client: ReturnType<typeof createBaseClient>,
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
  client: ReturnType<typeof createBaseClient>,
  account: Address
): Promise<bigint> {
  try {
    return await client.readContract({
      address: POSITION_MANAGER,
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
  wbtcBalance: bigint;
  cbbtcBalance: bigint;
  usdcBalance: bigint;
  positionCount: number;
  btcPrice: number;
}

export async function checkSmartAccountPosition(address: Address): Promise<PositionSnapshot> {
  const client = createBaseClient();

  const [wbtc, cbbtc, usdc, lpNftCount, btcPrice] = await Promise.all([
    fetchBalance(client, TOKENS.WBTC.address, address),
    fetchBalance(client, TOKENS.CBBTC.address, address),
    fetchBalance(client, TOKENS.USDC.address, address),
    fetchNFTBalance(client, address),
    fetchBTCPrice(),
  ]);

  const wbtcAmt = Number(formatUnits(wbtc, 8));
  const cbbtcAmt = Number(formatUnits(cbbtc, 8));
  const usdcAmt = Number(formatUnits(usdc, 6));
  const walletValueUsd = wbtcAmt * btcPrice + cbbtcAmt * btcPrice + usdcAmt;
  const positionCount = Number(lpNftCount);

  return {
    hasPosition: positionCount > 0,
    walletValueUsd,
    wbtcBalance: wbtc,
    cbbtcBalance: cbbtc,
    usdcBalance: usdc,
    positionCount,
    btcPrice,
  };
}
