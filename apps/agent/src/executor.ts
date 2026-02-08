/**
 * Session key executor.
 *
 * Deserializes a serialized permission account and sends UserOps
 * via the ZeroDev bundler. Chain is resolved dynamically from the
 * strategy config (ENS), not hardcoded.
 *
 * This is the ONLY place that touches session private keys.
 */

import { createPublicClient, http, type Address, type Hex, type Chain } from "viem";
import { mainnet, base, arbitrum } from "viem/chains";
import { createKernelAccountClient, createZeroDevPaymasterClient } from "@zerodev/sdk";
import { deserializePermissionAccount } from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { privateKeyToAccount } from "viem/accounts";
import type { AgentSubscription } from "./store.js";

const ENTRYPOINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as Address;

/** Map chain IDs to viem chain objects */
const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  8453: base,
  42161: arbitrum,
};

/** Default RPC URLs per chain (fallback when env not set) */
const DEFAULT_RPC: Record<number, string> = {
  1: "https://ethereum-rpc.publicnode.com",
  8453: "https://mainnet.base.org",
  42161: "https://arb1.arbitrum.io/rpc",
};

function getViemChain(chainId: number): Chain {
  const chain = CHAIN_MAP[chainId];
  if (!chain) {
    throw new Error(`[executor] Unsupported chain ID: ${chainId}`);
  }
  return chain;
}

function getRpcUrl(chainId: number): string {
  // Check env overrides first
  const envMap: Record<number, string | undefined> = {
    1: process.env.ETHEREUM_RPC,
    8453: process.env.BASE_RPC,
    42161: process.env.ARBITRUM_RPC,
  };
  return envMap[chainId] || DEFAULT_RPC[chainId] || "";
}

function getZeroDevRpc(chainId: number): string {
  const projectId = process.env.ZERODEV_PROJECT_ID || "";
  return `https://rpc.zerodev.app/api/v3/${projectId}/chain/${chainId}`;
}

export interface ExecutionResult {
  success: boolean;
  txHash?: string;
  userOpHash?: string;
  error?: string;
}

/** Transaction descriptor from the API /build response */
export interface ApiTransaction {
  to: Address;
  data: Hex;
  value: string;
  description: string;
}

/**
 * Execute transactions via a session key on the specified chain.
 *
 * @param subscription - The agent subscription containing session key material
 * @param transactions - Array of transaction descriptors from the API /build endpoint
 * @param chainId - Target chain ID (default: 1 for Ethereum mainnet)
 */
export async function executeViaSessionKey(
  subscription: AgentSubscription,
  transactions: ApiTransaction[],
  chainId: number = 1
): Promise<ExecutionResult> {
  if (!subscription.serializedSessionKey) {
    return { success: false, error: "No serialized session key" };
  }
  if (!subscription.sessionPrivateKey) {
    return { success: false, error: "No session private key" };
  }
  if (!process.env.ZERODEV_PROJECT_ID) {
    return { success: false, error: "ZERODEV_PROJECT_ID not configured" };
  }
  if (transactions.length === 0) {
    return { success: false, error: "No transactions to execute" };
  }

  const chain = getViemChain(chainId);
  const rpcUrl = getRpcUrl(chainId);
  const zerodevRpc = getZeroDevRpc(chainId);

  console.log(`[executor] Chain: ${chain.name} (${chainId}), ZeroDev RPC: ${zerodevRpc}`);

  try {
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    const sessionKeySigner = await toECDSASigner({
      signer: privateKeyToAccount(subscription.sessionPrivateKey as `0x${string}`),
    });

    const kernelAccount = await deserializePermissionAccount(
      publicClient,
      { address: ENTRYPOINT_V07, version: "0.7" },
      KERNEL_V3_1,
      subscription.serializedSessionKey,
      sessionKeySigner
    );

    const zerodevPaymaster = createZeroDevPaymasterClient({
      chain,
      transport: http(zerodevRpc),
    });

    const kernelClient = createKernelAccountClient({
      account: kernelAccount,
      chain,
      bundlerTransport: http(zerodevRpc),
      paymaster: {
        getPaymasterData(userOperation) {
          return zerodevPaymaster.sponsorUserOperation({ userOperation });
        },
      },
    });

    const calls = transactions.map((tx) => ({
      to: tx.to,
      value: BigInt(tx.value || "0"),
      data: tx.data,
    }));

    const callData = await kernelAccount.encodeCalls(calls);

    const userOpHash = await kernelClient.sendUserOperation({ callData });
    console.log(`[executor] UserOp sent: ${userOpHash}`);

    const receipt = await kernelClient.waitForUserOperationReceipt({ hash: userOpHash });
    console.log(`[executor] Tx confirmed: ${receipt.receipt.transactionHash}`);

    return {
      success: true,
      txHash: receipt.receipt.transactionHash,
      userOpHash,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown executor error";
    console.error(
      `[executor] Error for ${subscription.smartAccount} on chain ${chainId}:`,
      message
    );
    return { success: false, error: message };
  }
}
