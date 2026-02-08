/**
 * Session key executor.
 *
 * Deserializes a serialized permission account and sends UserOps
 * via the ZeroDev bundler on Base chain.
 *
 * This is the ONLY place that touches session private keys.
 */

import { createPublicClient, http, type Address, type Hex } from "viem";
import { base } from "viem/chains";
import { createKernelAccountClient, createZeroDevPaymasterClient } from "@zerodev/sdk";
import { deserializePermissionAccount } from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { privateKeyToAccount } from "viem/accounts";
import type { AgentSubscription } from "./store.js";

const ENTRYPOINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as Address;
const BASE_RPC = process.env.BASE_RPC || "https://mainnet.base.org";
const ZERODEV_PROJECT_ID = process.env.ZERODEV_PROJECT_ID || "";

function getZeroDevRpc(): string {
  return `https://rpc.zerodev.app/api/v3/${ZERODEV_PROJECT_ID}/chain/8453`;
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

export async function executeViaSessionKey(
  subscription: AgentSubscription,
  transactions: ApiTransaction[]
): Promise<ExecutionResult> {
  if (!subscription.serializedSessionKey) {
    return { success: false, error: "No serialized session key" };
  }
  if (!subscription.sessionPrivateKey) {
    return { success: false, error: "No session private key" };
  }
  if (!ZERODEV_PROJECT_ID) {
    return { success: false, error: "ZERODEV_PROJECT_ID not configured" };
  }
  if (transactions.length === 0) {
    return { success: false, error: "No transactions to execute" };
  }

  try {
    const publicClient = createPublicClient({
      chain: base,
      transport: http(BASE_RPC),
    });

    const zerodevRpc = getZeroDevRpc();

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
      chain: base,
      transport: http(zerodevRpc),
    });

    const kernelClient = createKernelAccountClient({
      account: kernelAccount,
      chain: base,
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
    console.error(`[executor] Error for ${subscription.smartAccount}:`, message);
    return { success: false, error: message };
  }
}
