"use client";

import { useState, useCallback, useRef } from "react";
import { namehash, labelhash } from "viem/ens";
import { type Address, encodeFunctionData } from "viem";
import { usePublicClient, useWalletClient, useConnection } from "wagmi";

/**
 * Parent domain for PrismOS agents
 */
export const PRISMOS_DOMAIN = "prismos.eth";

/**
 * ENS Registry ABI (only the functions we need)
 */
export const ENS_REGISTRY_ABI = [
  {
    name: "owner",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "resolver",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "text",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "setSubnodeRecord",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "label", type: "bytes32" },
      { name: "owner", type: "address" },
      { name: "resolver", type: "address" },
      { name: "ttl", type: "uint64" },
    ],
    outputs: [],
  },
] as const;

/**
 * Contract addresses
 */
export const ENS_REGISTRY: Record<number, Address> = {
  1: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e", // Mainnet
  11155111: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e", // Sepolia (same address)
};

const PUBLIC_RESOLVER: Record<number, Address> = {
  1: "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63", // Mainnet
  11155111: "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD", // Sepolia
};

export interface SubdomainAvailability {
  name: string;
  fullName: string;
  isAvailable: boolean;
  /** True if the subdomain exists but is owned by the connected wallet */
  isOwnedByUser: boolean;
  currentOwner: Address | null;
}

export type ConfirmationStatus = "none" | "pending" | "confirmed" | "failed";

interface UseClaimSubdomainReturn {
  /** Check if a subdomain is available */
  checkAvailability: (label: string) => Promise<SubdomainAvailability | null>;
  /** Claim a subdomain (requires wallet to be owner of parent domain) */
  claimSubdomain: (label: string) => Promise<`0x${string}` | null>;
  /** Check if connected wallet can claim subdomains */
  checkCanClaim: () => Promise<boolean>;
  /** Availability result */
  availability: SubdomainAvailability | null;
  /** Can the connected wallet claim? */
  canClaim: boolean;
  /** Loading states */
  isCheckingAvailability: boolean;
  isCheckingPermission: boolean;
  isClaiming: boolean;
  /** Confirmation status (none -> pending -> confirmed/failed) */
  confirmationStatus: ConfirmationStatus;
  /** Transaction hash */
  txHash: `0x${string}` | null;
  /** Error message */
  error: string | null;
  /** Clear state */
  clear: () => void;
}

/**
 * Hook to check availability and claim ENS subdomains under prismos.eth
 */
export function useClaimSubdomain(): UseClaimSubdomainReturn {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { address: connectedAddress } = useConnection();

  const [availability, setAvailability] = useState<SubdomainAvailability | null>(null);
  const [canClaim, setCanClaim] = useState(false);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [isCheckingPermission, setIsCheckingPermission] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [confirmationStatus, setConfirmationStatus] = useState<ConfirmationStatus>("none");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Use ref to track if component is still mounted for async operations
  const isMountedRef = useRef(true);

  /**
   * Check if connected wallet is owner of prismos.eth (can create subdomains)
   */
  const checkCanClaim = useCallback(async (): Promise<boolean> => {
    if (!publicClient || !connectedAddress) {
      setCanClaim(false);
      return false;
    }

    setIsCheckingPermission(true);
    setError(null);

    try {
      const chainId = await publicClient.getChainId();
      const registryAddress = ENS_REGISTRY[chainId];

      if (!registryAddress) {
        setError(`ENS not supported on chain ${chainId}`);
        setCanClaim(false);
        return false;
      }

      const parentNode = namehash(PRISMOS_DOMAIN);

      const owner = await publicClient.readContract({
        address: registryAddress,
        abi: ENS_REGISTRY_ABI,
        functionName: "owner",
        args: [parentNode],
      });

      const isOwner = owner.toLowerCase() === connectedAddress.toLowerCase();
      setCanClaim(isOwner);
      return isOwner;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to check permissions";
      setError(message);
      setCanClaim(false);
      return false;
    } finally {
      setIsCheckingPermission(false);
    }
  }, [publicClient, connectedAddress]);

  /**
   * Check if a subdomain is available or owned by current user
   */
  const checkAvailability = useCallback(
    async (label: string): Promise<SubdomainAvailability | null> => {
      if (!publicClient) {
        setError("No client available");
        return null;
      }

      // Validate label
      const cleanLabel = label.toLowerCase().trim();
      if (!cleanLabel) {
        setError("Please enter a subdomain name");
        return null;
      }

      if (!/^[a-z0-9-]+$/.test(cleanLabel)) {
        setError("Subdomain can only contain lowercase letters, numbers, and hyphens");
        return null;
      }

      if (cleanLabel.length < 3) {
        setError("Subdomain must be at least 3 characters");
        return null;
      }

      if (cleanLabel.length > 32) {
        setError("Subdomain must be 32 characters or less");
        return null;
      }

      setIsCheckingAvailability(true);
      setError(null);

      try {
        const chainId = await publicClient.getChainId();
        const registryAddress = ENS_REGISTRY[chainId];

        if (!registryAddress) {
          setError(`ENS not supported on chain ${chainId}`);
          return null;
        }

        const fullName = `${cleanLabel}.${PRISMOS_DOMAIN}`;
        const subdomainNode = namehash(fullName);

        // Check if subdomain has an owner
        const owner = await publicClient.readContract({
          address: registryAddress,
          abi: ENS_REGISTRY_ABI,
          functionName: "owner",
          args: [subdomainNode],
        });

        const isAvailable = owner === "0x0000000000000000000000000000000000000000";

        // Check if the connected wallet owns this subdomain
        const isOwnedByUser =
          !isAvailable &&
          !!connectedAddress &&
          owner.toLowerCase() === connectedAddress.toLowerCase();

        const result: SubdomainAvailability = {
          name: cleanLabel,
          fullName,
          isAvailable,
          isOwnedByUser,
          currentOwner: isAvailable ? null : owner,
        };

        setAvailability(result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to check availability";
        setError(message);
        return null;
      } finally {
        setIsCheckingAvailability(false);
      }
    },
    [publicClient, connectedAddress]
  );

  /**
   * Wait for transaction confirmation in background (non-blocking)
   */
  const waitForConfirmationInBackground = useCallback(
    async (hash: `0x${string}`) => {
      if (!publicClient) return;

      setConfirmationStatus("pending");

      try {
        // Use conservative polling settings to avoid rate limits
        await publicClient.waitForTransactionReceipt({
          hash,
          pollingInterval: 4000, // Poll every 4 seconds instead of default ~1s
          timeout: 120_000, // 2 minute timeout
        });

        if (isMountedRef.current) {
          setConfirmationStatus("confirmed");
        }
      } catch (err) {
        // Don't set error - tx was already submitted successfully
        // Just mark confirmation as failed (user can check etherscan)
        if (isMountedRef.current) {
          setConfirmationStatus("failed");
          console.warn("Transaction confirmation check failed:", err);
        }
      }
    },
    [publicClient]
  );

  /**
   * Claim a subdomain under prismos.eth
   */
  const claimSubdomain = useCallback(
    async (label: string): Promise<`0x${string}` | null> => {
      if (!publicClient || !walletClient || !connectedAddress) {
        setError("Please connect your wallet");
        return null;
      }

      const cleanLabel = label.toLowerCase().trim();

      setIsClaiming(true);
      setError(null);
      setTxHash(null);
      setConfirmationStatus("none");

      try {
        const chainId = await publicClient.getChainId();
        const registryAddress = ENS_REGISTRY[chainId];
        const resolverAddress = PUBLIC_RESOLVER[chainId];

        if (!registryAddress || !resolverAddress) {
          setError(`ENS not supported on chain ${chainId}`);
          return null;
        }

        // First verify availability
        const avail = await checkAvailability(cleanLabel);
        if (!avail?.isAvailable) {
          setError(`Subdomain "${cleanLabel}" is not available`);
          return null;
        }

        // Verify caller can create subdomains
        const canCreate = await checkCanClaim();
        if (!canCreate) {
          setError(
            "Your wallet is not authorized to create subdomains. Contact PrismOS team or use your own ENS domain."
          );
          return null;
        }

        const parentNode = namehash(PRISMOS_DOMAIN);
        const labelHash = labelhash(cleanLabel);

        // Encode setSubnodeRecord call
        const data = encodeFunctionData({
          abi: ENS_REGISTRY_ABI,
          functionName: "setSubnodeRecord",
          args: [
            parentNode,
            labelHash,
            connectedAddress, // New owner = connected wallet
            resolverAddress, // Use public resolver
            BigInt(0), // TTL = 0 (no caching)
          ],
        });

        // Send transaction
        const hash = await walletClient.sendTransaction({
          to: registryAddress,
          data,
        });

        setTxHash(hash);
        setIsClaiming(false); // Transaction submitted, no longer "claiming"

        // Start background confirmation (non-blocking)
        // Don't await - let user proceed immediately
        waitForConfirmationInBackground(hash);

        return hash;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to claim subdomain";
        setError(message);
        setIsClaiming(false);
        return null;
      }
    },
    [
      publicClient,
      walletClient,
      connectedAddress,
      checkAvailability,
      checkCanClaim,
      waitForConfirmationInBackground,
    ]
  );

  const clear = useCallback(() => {
    setAvailability(null);
    setTxHash(null);
    setError(null);
    setConfirmationStatus("none");
  }, []);

  return {
    checkAvailability,
    claimSubdomain,
    checkCanClaim,
    availability,
    canClaim,
    isCheckingAvailability,
    isCheckingPermission,
    isClaiming,
    confirmationStatus,
    txHash,
    error,
    clear,
  };
}
