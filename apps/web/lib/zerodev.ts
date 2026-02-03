/**
 * ZeroDev Client for PrismOS
 *
 * Creates Smart Accounts (ERC-4337) and Session Keys for users.
 */

import {
  createPublicClient,
  http,
  Address,
  parseAbi,
  zeroAddress,
  type WalletClient,
  type Chain,
} from "viem";
import { mainnet, arbitrum, base, sepolia } from "viem/chains";
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { toCallPolicy, toSudoPolicy, CallPolicyVersion } from "@zerodev/permissions/policies";
import { toECDSASigner } from "@zerodev/permissions/signers";
import {
  toPermissionValidator,
  serializePermissionAccount,
  toInitConfig,
} from "@zerodev/permissions";
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
  permissions: string[];
  expiresAt?: number;
  deploymentTxHash?: string;
}

const ENTRYPOINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as Address;

const CHAINS: Record<ChainId, Chain> = {
  1: mainnet,
  42161: arbitrum,
  8453: base,
  11155111: sepolia,
};

const DEFAULT_CHAIN_ID: ChainId = 42161;
const CHAIN_ID: ChainId = parseInt(
  process.env.NEXT_PUBLIC_CHAIN_ID || String(DEFAULT_CHAIN_ID)
) as ChainId;
const CURRENT_CHAIN: Chain = CHAINS[CHAIN_ID] || CHAINS[DEFAULT_CHAIN_ID];

const POSITION_MANAGERS: Record<number, Address> = {
  42161: "0xd88f38f930b7952f2db2432cb002e7abbf3dd869",
  8453: "0x7C5f5A4bBd8fD63184577525326123B519429bdc",
};
const POSITION_MANAGER = POSITION_MANAGERS[CHAIN_ID] || POSITION_MANAGERS[42161];

const PUBLIC_RPC_URLS: Record<ChainId, string> = {
  1: "https://eth.llamarpc.com",
  42161: "https://arb1.arbitrum.io/rpc",
  8453: "https://base-mainnet.public.blastapi.io",
  11155111: "https://rpc.sepolia.org",
};

const POSITION_MANAGER_ABI = parseAbi([
  "function collect(uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max) external returns (uint256 amount0, uint256 amount1)",
  "function decreaseLiquidity(uint256 tokenId, uint128 liquidity, uint256 amount0Min, uint256 amount1Min, bytes calldata hookData) external returns (uint256 amount0, uint256 amount1)",
  "function increaseLiquidity(uint256 tokenId, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, bytes calldata hookData) external returns (uint128 liquidity, uint256 amount0, uint256 amount1)",
  "function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable",
]);

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

function createAgentPolicy() {
  // to patch with restrive call policy
  return toSudoPolicy({});

  // return toCallPolicy({
  //   policyVersion: CallPolicyVersion.V0_0_4,
  //   permissions: [
  //     { target: POSITION_MANAGER, abi: POSITION_MANAGER_ABI, functionName: 'collect' },
  //     { target: POSITION_MANAGER, abi: POSITION_MANAGER_ABI, functionName: 'decreaseLiquidity' },
  //     { target: POSITION_MANAGER, abi: POSITION_MANAGER_ABI, functionName: 'increaseLiquidity' },
  //     { target: POSITION_MANAGER, abi: POSITION_MANAGER_ABI, functionName: 'modifyLiquidities' },
  //   ],
  // });
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
  const config = getConfig(projectId);

  try {
    console.log("[ZeroDev] Creating ECDSA validator...");
    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
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
  } catch (error: any) {
    console.error("[ZeroDev] === createSmartAccount ERROR ===");
    console.error("[ZeroDev] Error:", error?.message);
    throw new Error(`Smart account creation failed: ${error?.message || "Unknown error"}`);
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

    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
      signer: signer as any,
      entryPoint: { address: ENTRYPOINT_V07, version: "0.7" },
      kernelVersion: KERNEL_V3_1,
    });

    console.log("[ZeroDev] Creating kernel account with initConfig...");
    const kernelAccount = await createKernelAccount(publicClient, {
      plugins: {
        sudo: ecdsaValidator,
      },
      entryPoint: { address: ENTRYPOINT_V07, version: "0.7" },
      kernelVersion: KERNEL_V3_1,
      initConfig: await toInitConfig(permissionPlugin),
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
    console.log("[ZeroDev] Wallet deployed + permissions installed!");

    const serialized = await serializePermissionAccount(
      kernelAccount,
      undefined,
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
      permissions: ["collect", "decreaseLiquidity", "increaseLiquidity", "modifyLiquidities"],
      expiresAt: Date.now() + SESSION_KEY_TTL_MS,
      deploymentTxHash: receipt.receipt.transactionHash,
    };
  } catch (error: any) {
    console.error("[ZeroDev] === createSessionKey ERROR ===");
    console.error("[ZeroDev] Error:", error?.message);
    console.error("[ZeroDev] Full error:", error);
    throw new Error(`Session key creation failed: ${error?.message || "Unknown error"}`);
  }
}

export async function getSmartAccountAddress(
  ownerAddress: Address,
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
