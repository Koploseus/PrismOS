/**
 * ZeroDev Client for PrismOS
 *
 * Creates Smart Accounts (ERC-4337) and Session Keys for users.
 */

import {
  createPublicClient,
  http,
  Address,
  Hex,
  parseAbi,
  zeroAddress,
  concatHex,
  encodeFunctionData,
  pad,
  type WalletClient,
  type Chain,
} from "viem";
import { mainnet } from "viem/chains";
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { toSudoPolicy } from "@zerodev/permissions/policies";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { toPermissionValidator, serializePermissionAccount } from "@zerodev/permissions";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import type { ChainId } from "@/lib/types";

export interface SmartAccountInfo {
  address: Address;
  isDeployed: boolean;
  owner: Address;
  deploymentTxHash?: string;
}

export interface SessionKeyGrant {
  serialized: string;
  sessionKeyAddress: Address;
  sessionPrivateKey: string;
  smartAccountAddress: Address;
  agentAddress: Address;
  permissionId: Hex;
  permissions: string[];
  expiresAt?: number;
  deploymentTxHash?: string;
}

const ENTRYPOINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as Address;

const CHAINS: Record<ChainId, Chain> = {
  1: mainnet,
};

const DEFAULT_CHAIN_ID: ChainId = 1;
const CHAIN_ID: ChainId = parseInt(
  process.env.NEXT_PUBLIC_CHAIN_ID || String(DEFAULT_CHAIN_ID)
) as ChainId;

const PUBLIC_RPC_URLS: Record<ChainId, string> = {
  1: "https://ethereum-rpc.publicnode.com",
};

function getZeroDevRpcUrl(projectId: string, chainId: ChainId = CHAIN_ID): string {
  return `https://rpc.zerodev.app/api/v3/${projectId}/chain/${chainId}`;
}

function getConfig(projectId: string, chainId: ChainId = CHAIN_ID) {
  const useLocalFork =
    typeof window !== "undefined" && process.env.NEXT_PUBLIC_USE_LOCAL_FORK === "true";

  const zerodevRpc = getZeroDevRpcUrl(projectId, chainId);

  return {
    useLocalFork,
    rpcUrl: useLocalFork
      ? "http://127.0.0.1:8545"
      : PUBLIC_RPC_URLS[chainId] || PUBLIC_RPC_URLS[DEFAULT_CHAIN_ID],
    zerodevRpc,
    chain: CHAINS[chainId] || CHAINS[DEFAULT_CHAIN_ID],
  };
}

function createChainClient(projectId: string, chainId: ChainId = CHAIN_ID) {
  const config = getConfig(projectId, chainId);
  console.log("[ZeroDev] Using RPC:", config.rpcUrl);
  console.log("[ZeroDev] Chain ID:", chainId);

  return createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl),
  });
}

function validateWalletClient(walletClient: WalletClient): {
  address: Address;
  signer: WalletClient & { account: NonNullable<WalletClient["account"]> };
} {
  if (!walletClient) {
    throw new Error("Wallet client is null or undefined");
  }
  if (!walletClient.account) {
    throw new Error("Wallet client has no account - is wallet connected?");
  }
  if (!walletClient.account.address) {
    throw new Error("Wallet client account has no address");
  }
  return {
    address: walletClient.account.address,
    signer: walletClient as WalletClient & { account: NonNullable<WalletClient["account"]> },
  };
}

/**
 * Create sudo policy — grants full rights to the session key.
 * TODO (Phase 1): Replace with scoped CallPolicy based on ENS permissions.
 */
function createAgentPolicy() {
  return toSudoPolicy({});
}

export async function createSmartAccount(
  walletClient: WalletClient,
  projectId: string,
  deploy: boolean = false
): Promise<SmartAccountInfo> {
  console.log("[ZeroDev] === createSmartAccount START ===");
  console.log("[ZeroDev] Deploy:", deploy);

  const { address: ownerAddress, signer } = validateWalletClient(walletClient);
  console.log("[ZeroDev] Owner address:", ownerAddress);

  const publicClient = createChainClient(projectId);

  try {
    console.log("[ZeroDev] Creating ECDSA validator...");
    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signer: signer as any,
      entryPoint: { address: ENTRYPOINT_V07, version: "0.7" },
      kernelVersion: KERNEL_V3_1,
    });

    console.log("[ZeroDev] Creating Kernel account...");
    const kernelAccount = await createKernelAccount(publicClient, {
      plugins: { sudo: ecdsaValidator },
      entryPoint: { address: ENTRYPOINT_V07, version: "0.7" },
      kernelVersion: KERNEL_V3_1,
    });

    console.log("[ZeroDev] Kernel account address:", kernelAccount.address);

    const code = await publicClient.getCode({ address: kernelAccount.address });
    const isDeployed = code !== undefined && code !== "0x";
    const deploymentTxHash: string | undefined = undefined;

    console.log("[ZeroDev] === createSmartAccount SUCCESS ===");
    return {
      address: kernelAccount.address,
      isDeployed,
      owner: ownerAddress,
      deploymentTxHash,
    };
  } catch (error: unknown) {
    console.error("[ZeroDev] === createSmartAccount ERROR ===");
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ZeroDev] Error:", message);
    throw new Error(`Smart account creation failed: ${message}`);
  }
}

export async function createSessionKey(
  walletClient: WalletClient,
  agentAddress: Address,
  projectId: string
): Promise<SessionKeyGrant> {
  console.log("[ZeroDev] === createSessionKey START ===");

  const { address: ownerAddress, signer } = validateWalletClient(walletClient);
  console.log("[ZeroDev] Owner address:", ownerAddress);
  console.log("[ZeroDev] Agent address:", agentAddress);

  if (!agentAddress || agentAddress.length !== 42) {
    throw new Error(`Invalid agent address: ${agentAddress}`);
  }

  const publicClient = createChainClient(projectId);
  const config = getConfig(projectId);

  try {
    const sessionPrivateKey = generatePrivateKey();
    const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);
    console.log("[ZeroDev] Session key address:", sessionKeyAccount.address);

    const sessionSigner = await toECDSASigner({ signer: sessionKeyAccount });

    const agentPolicy = createAgentPolicy();

    const permissionPlugin = await toPermissionValidator(publicClient, {
      signer: sessionSigner,
      policies: [agentPolicy],
      entryPoint: { address: ENTRYPOINT_V07, version: "0.7" },
      kernelVersion: KERNEL_V3_1,
    });

    const permissionId = permissionPlugin.getIdentifier() as Hex;

    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      signer: signer as any,
      entryPoint: { address: ENTRYPOINT_V07, version: "0.7" },
      kernelVersion: KERNEL_V3_1,
    });

    console.log("[ZeroDev] Creating kernel account (deterministic)...");
    const kernelAccount = await createKernelAccount(publicClient, {
      plugins: {
        sudo: ecdsaValidator,
      },
      entryPoint: { address: ENTRYPOINT_V07, version: "0.7" },
      kernelVersion: KERNEL_V3_1,
    });

    console.log("[ZeroDev] Kernel account address:", kernelAccount.address);

    const zerodevPaymaster = createZeroDevPaymasterClient({
      chain: config.chain,
      transport: http(config.zerodevRpc),
    });

    const kernelClient = createKernelAccountClient({
      account: kernelAccount,
      chain: config.chain,
      bundlerTransport: http(config.zerodevRpc),
      paymaster: {
        getPaymasterData(userOperation) {
          return zerodevPaymaster.sponsorUserOperation({ userOperation });
        },
      },
    });

    console.log("[ZeroDev] Sending UserOp to deploy + install permissions...");
    const userOpHash = await kernelClient.sendUserOperation({
      callData: await kernelAccount.encodeCalls([
        {
          to: zeroAddress,
          value: 0n,
          data: "0x",
        },
      ]),
    });

    console.log("[ZeroDev] UserOp hash:", userOpHash);

    const receipt = await kernelClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });

    console.log("[ZeroDev] Deployment tx:", receipt.receipt.transactionHash);
    console.log("[ZeroDev] Wallet deployed!");

    const kernelAccountWithPermission = await createKernelAccount(publicClient, {
      address: kernelAccount.address,
      plugins: {
        sudo: ecdsaValidator,
        regular: permissionPlugin,
      },
      entryPoint: { address: ENTRYPOINT_V07, version: "0.7" },
      kernelVersion: KERNEL_V3_1,
    });

    const serialized = await serializePermissionAccount(
      kernelAccountWithPermission,
      sessionPrivateKey,
      undefined,
      undefined,
      permissionPlugin
    );
    console.log("[ZeroDev] Session serialized, length:", serialized.length);

    const SESSION_KEY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

    return {
      serialized,
      sessionKeyAddress: sessionKeyAccount.address,
      sessionPrivateKey,
      smartAccountAddress: kernelAccount.address,
      agentAddress,
      permissionId,
      permissions: ["sudo"],
      expiresAt: Date.now() + SESSION_KEY_TTL_MS,
      deploymentTxHash: receipt.receipt.transactionHash,
    };
  } catch (error: unknown) {
    console.error("[ZeroDev] === createSessionKey ERROR ===");
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[ZeroDev] Error:", message);
    console.error("[ZeroDev] Full error:", error);
    throw new Error(`Session key creation failed: ${message}`);
  }
}

const UNINSTALL_VALIDATION_ABI = parseAbi([
  "function uninstallValidation(bytes21 validatorId, bytes calldata deInitData, bytes calldata hookDeInitData) external",
]);

export async function revokeSessionKey(
  walletClient: WalletClient,
  projectId: string,
  smartAccountAddress: Address,
  permissionId: Hex
): Promise<string> {
  console.log("[ZeroDev] === revokeSessionKey START ===");
  console.log("[ZeroDev] Smart account:", smartAccountAddress);
  console.log("[ZeroDev] Permission ID:", permissionId);

  const { signer } = validateWalletClient(walletClient);

  const publicClient = createChainClient(projectId);
  const config = getConfig(projectId);

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    signer: signer as any,
    entryPoint: { address: ENTRYPOINT_V07, version: "0.7" },
    kernelVersion: KERNEL_V3_1,
  });

  const kernelAccount = await createKernelAccount(publicClient, {
    address: smartAccountAddress,
    plugins: { sudo: ecdsaValidator },
    entryPoint: { address: ENTRYPOINT_V07, version: "0.7" },
    kernelVersion: KERNEL_V3_1,
  });

  const zerodevPaymaster = createZeroDevPaymasterClient({
    chain: config.chain,
    transport: http(config.zerodevRpc),
  });

  const kernelClient = createKernelAccountClient({
    account: kernelAccount,
    chain: config.chain,
    bundlerTransport: http(config.zerodevRpc),
    paymaster: {
      getPaymasterData(userOperation) {
        return zerodevPaymaster.sponsorUserOperation({ userOperation });
      },
    },
  });

  // Construct validatorId: 0x02 prefix + permissionId padded to 20 bytes
  const validatorId = concatHex(["0x02", pad(permissionId, { size: 20, dir: "right" })]);

  const callData = encodeFunctionData({
    abi: UNINSTALL_VALIDATION_ABI,
    functionName: "uninstallValidation",
    args: [validatorId as `0x${string}`, "0x", "0x"],
  });

  console.log("[ZeroDev] Sending UserOp to uninstall validation...");
  const userOpHash = await kernelClient.sendUserOperation({
    callData: await kernelAccount.encodeCalls([
      {
        to: smartAccountAddress,
        value: 0n,
        data: callData,
      },
    ]),
  });

  console.log("[ZeroDev] Revoke UserOp hash:", userOpHash);

  const receipt = await kernelClient.waitForUserOperationReceipt({
    hash: userOpHash,
  });

  console.log("[ZeroDev] Revocation tx:", receipt.receipt.transactionHash);
  console.log("[ZeroDev] === revokeSessionKey SUCCESS ===");

  return receipt.receipt.transactionHash;
}

export async function getSmartAccountAddress(
  ownerAddress: Address,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  projectId: string
): Promise<Address | null> {
  console.log("[ZeroDev] === getSmartAccountAddress START ===");
  console.log("[ZeroDev] Owner address:", ownerAddress);

  if (!ownerAddress || ownerAddress.length !== 42) {
    console.error("[ZeroDev] Invalid owner address");
    return null;
  }

  console.log("[ZeroDev] Counterfactual address computation not implemented");
  return null;
}
