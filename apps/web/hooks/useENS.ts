"use client";

/**
 * useENS Hook
 *
 * Consolidated hook for all ENS operations:
 * - Check subdomain availability
 * - Claim subdomains under prismos.eth
 * - Fetch agents from ENS subdomains
 * - Update ENS text records
 */

import { useState, useCallback, useRef } from "react";
import { namehash, labelhash, normalize } from "viem/ens";
import { type Address, encodeFunctionData } from "viem";
import { usePublicClient, useWalletClient, useConnection } from "wagmi";
import { DEFAULT_ENS_CHAIN_ID, ENS_TEXT_KEYS, ALL_ENS_TEXT_KEYS } from "@/lib/ens";
import type { SubgraphDomain, SubgraphSubdomain, DomainByNameQueryResult } from "@/lib/ens";
import type { Agent, AgentPermission, ChainId, RiskLevel, Protocol } from "@/lib/types";

// =============================================================================
// Constants
// =============================================================================

export const PRISMOS_DOMAIN = "prismos.eth";

const ENS_REGISTRY: Record<number, Address> = {
  1: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
  11155111: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
};

const PUBLIC_RESOLVER: Record<number, Address> = {
  1: "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63",
  11155111: "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD",
};

const ENS_REGISTRY_ABI = [
  {
    name: "owner",
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

const PUBLIC_RESOLVER_ABI = [
  {
    name: "setText",
    type: "function",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "multicall",
    type: "function",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
] as const;

// =============================================================================
// Types
// =============================================================================

export interface SubdomainAvailability {
  name: string;
  fullName: string;
  isAvailable: boolean;
  isOwnedByUser: boolean;
  currentOwner: Address | null;
}

export type ConfirmationStatus = "none" | "pending" | "confirmed" | "failed";

export interface ENSSubdomain {
  id: string;
  name: string;
  label: string;
  owner: string | null;
  resolver: {
    address: `0x${string}`;
    texts: string[];
  } | null;
  availableTextKeys: string[];
  createdAt: Date;
}

export interface ENSDomain {
  name: string;
  label: string;
  owner: string | null;
  subdomainCount: number;
  subdomains: ENSSubdomain[];
}

export interface ParsedAgentData {
  name: string;
  description: string;
  wallet: string;
  avatar?: string;
  version?: string;
  strategyId: string;
  pool: string;
  chainId: ChainId;
  risk: RiskLevel;
  protocol: Protocol;
  pair: string;
  strategyDescription?: string;
  collectFeePercent: number;
  rebalanceFeeUsd: number;
  compoundFeePercent: number;
  rangeAdjustFeeUsd: number;
  permissions: AgentPermission[];
  contracts: string[];
}

interface UseENSReturn {
  // Subdomain claiming
  checkAvailability: (label: string) => Promise<SubdomainAvailability | null>;
  claimSubdomain: (label: string) => Promise<`0x${string}` | null>;
  checkCanClaim: () => Promise<boolean>;
  availability: SubdomainAvailability | null;
  canClaim: boolean;
  isCheckingAvailability: boolean;
  isClaiming: boolean;
  confirmationStatus: ConfirmationStatus;
  claimTxHash: `0x${string}` | null;

  // Agent fetching
  agents: Agent[];
  domain: ENSDomain | null;
  fetchAgents: (domainName: string) => Promise<Agent[]>;
  fetchSubdomains: (domainName: string) => Promise<ENSDomain | null>;

  // Record updating
  updateRecords: (ensName: string, data: Partial<ParsedAgentData>) => Promise<`0x${string}` | null>;
  isUpdating: boolean;
  updateTxHash: `0x${string}` | null;

  // Shared state
  isLoading: boolean;
  error: string | null;
  clear: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useENS(chainId: number = DEFAULT_ENS_CHAIN_ID): UseENSReturn {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { address: connectedAddress } = useConnection();

  // Subdomain claiming state
  const [availability, setAvailability] = useState<SubdomainAvailability | null>(null);
  const [canClaim, setCanClaim] = useState(false);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [confirmationStatus, setConfirmationStatus] = useState<ConfirmationStatus>("none");
  const [claimTxHash, setClaimTxHash] = useState<`0x${string}` | null>(null);

  // Agent fetching state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [domain, setDomain] = useState<ENSDomain | null>(null);

  // Record updating state
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateTxHash, setUpdateTxHash] = useState<`0x${string}` | null>(null);

  // Shared state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  // ===========================================================================
  // Subdomain Claiming
  // ===========================================================================

  const checkCanClaim = useCallback(async (): Promise<boolean> => {
    if (!publicClient || !connectedAddress) {
      setCanClaim(false);
      return false;
    }

    try {
      const currentChainId = await publicClient.getChainId();
      const registryAddress = ENS_REGISTRY[currentChainId];

      if (!registryAddress) {
        setError(`ENS not supported on chain ${currentChainId}`);
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
    }
  }, [publicClient, connectedAddress]);

  const checkAvailability = useCallback(
    async (label: string): Promise<SubdomainAvailability | null> => {
      if (!publicClient) {
        setError("No client available");
        return null;
      }

      const cleanLabel = label.toLowerCase().trim();
      if (!cleanLabel) {
        setError("Please enter a subdomain name");
        return null;
      }

      if (!/^[a-z0-9-]+$/.test(cleanLabel)) {
        setError("Subdomain can only contain lowercase letters, numbers, and hyphens");
        return null;
      }

      if (cleanLabel.length < 3 || cleanLabel.length > 32) {
        setError("Subdomain must be 3-32 characters");
        return null;
      }

      setIsCheckingAvailability(true);
      setError(null);

      try {
        const currentChainId = await publicClient.getChainId();
        const registryAddress = ENS_REGISTRY[currentChainId];

        if (!registryAddress) {
          setError(`ENS not supported on chain ${currentChainId}`);
          return null;
        }

        const fullName = `${cleanLabel}.${PRISMOS_DOMAIN}`;
        const subdomainNode = namehash(fullName);

        const owner = await publicClient.readContract({
          address: registryAddress,
          abi: ENS_REGISTRY_ABI,
          functionName: "owner",
          args: [subdomainNode],
        });

        const isAvailable = owner === "0x0000000000000000000000000000000000000000";
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

  const waitForConfirmationInBackground = useCallback(
    async (hash: `0x${string}`) => {
      if (!publicClient) return;

      setConfirmationStatus("pending");

      try {
        await publicClient.waitForTransactionReceipt({
          hash,
          pollingInterval: 4000,
          timeout: 120_000,
        });

        if (isMountedRef.current) {
          setConfirmationStatus("confirmed");
        }
      } catch {
        if (isMountedRef.current) {
          setConfirmationStatus("failed");
        }
      }
    },
    [publicClient]
  );

  const claimSubdomain = useCallback(
    async (label: string): Promise<`0x${string}` | null> => {
      if (!publicClient || !walletClient || !connectedAddress) {
        setError("Please connect your wallet");
        return null;
      }

      const cleanLabel = label.toLowerCase().trim();

      setIsClaiming(true);
      setError(null);
      setClaimTxHash(null);
      setConfirmationStatus("none");

      try {
        const currentChainId = await publicClient.getChainId();
        const registryAddress = ENS_REGISTRY[currentChainId];
        const resolverAddress = PUBLIC_RESOLVER[currentChainId];

        if (!registryAddress || !resolverAddress) {
          setError(`ENS not supported on chain ${currentChainId}`);
          return null;
        }

        const avail = await checkAvailability(cleanLabel);
        if (!avail?.isAvailable) {
          setError(`Subdomain "${cleanLabel}" is not available`);
          return null;
        }

        const canCreate = await checkCanClaim();
        if (!canCreate) {
          setError("Your wallet is not authorized to create subdomains");
          return null;
        }

        const parentNode = namehash(PRISMOS_DOMAIN);
        const labelHash = labelhash(cleanLabel);

        const data = encodeFunctionData({
          abi: ENS_REGISTRY_ABI,
          functionName: "setSubnodeRecord",
          args: [parentNode, labelHash, connectedAddress, resolverAddress, BigInt(0)],
        });

        const hash = await walletClient.sendTransaction({
          to: registryAddress,
          data,
        });

        setClaimTxHash(hash);
        setIsClaiming(false);
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

  // ===========================================================================
  // Agent Fetching
  // ===========================================================================

  const fetchSubdomains = useCallback(
    async (domainName: string): Promise<ENSDomain | null> => {
      const normalizedName = domainName.toLowerCase().trim();
      if (!normalizedName) {
        setError("Please enter a domain name");
        return null;
      }

      const fullName = normalizedName.endsWith(".eth") ? normalizedName : `${normalizedName}.eth`;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/ens/subdomains?domain=${encodeURIComponent(fullName)}&chainId=${chainId}`
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch subdomains");
        }

        const queryResult = data as DomainByNameQueryResult;
        const domains = queryResult.domains;

        if (!domains || domains.length === 0) {
          setError(`Domain "${fullName}" not found`);
          setDomain(null);
          return null;
        }

        const parsedDomain = parseDomain(domains[0]);
        setDomain(parsedDomain);
        return parsedDomain;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch subdomains";
        setError(message);
        setDomain(null);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [chainId]
  );

  const fetchAgents = useCallback(
    async (domainName: string): Promise<Agent[]> => {
      const fetchedDomain = await fetchSubdomains(domainName);

      if (!fetchedDomain || !publicClient) {
        setAgents([]);
        return [];
      }

      const subdomainsWithResolver = fetchedDomain.subdomains.filter((sub) => sub.resolver);
      if (subdomainsWithResolver.length === 0) {
        setAgents([]);
        return [];
      }

      const calls = subdomainsWithResolver.flatMap((sub) => {
        const node = namehash(sub.name);
        return ALL_ENS_TEXT_KEYS.map((key) => ({
          address: sub.resolver!.address,
          abi: ENS_REGISTRY_ABI,
          functionName: "text" as const,
          args: [node, key] as const,
        }));
      });

      try {
        const results = await publicClient.multicall({ contracts: calls });

        const keysPerSub = ALL_ENS_TEXT_KEYS.length;
        const parsedAgents: Agent[] = [];

        for (let i = 0; i < subdomainsWithResolver.length; i++) {
          const sub = subdomainsWithResolver[i];
          const subResults = results.slice(i * keysPerSub, (i + 1) * keysPerSub);

          const records: Record<string, string> = {};
          for (let j = 0; j < ALL_ENS_TEXT_KEYS.length; j++) {
            const result = subResults[j];
            if (result.status === "success" && result.result) {
              records[ALL_ENS_TEXT_KEYS[j]] = result.result as string;
            }
          }

          const agent = parseAgentFromRecords(sub.name, sub.label, sub.createdAt, records);
          if (agent) {
            parsedAgents.push(agent);
          }
        }

        setAgents(parsedAgents);
        return parsedAgents;
      } catch (err) {
        console.error("Failed to fetch agent text records:", err);
        setAgents([]);
        return [];
      }
    },
    [publicClient, fetchSubdomains]
  );

  // ===========================================================================
  // Record Updating
  // ===========================================================================

  const updateRecords = useCallback(
    async (ensName: string, data: Partial<ParsedAgentData>): Promise<`0x${string}` | null> => {
      if (!publicClient || !walletClient) {
        setError("Please connect your wallet");
        return null;
      }

      setIsUpdating(true);
      setError(null);
      setUpdateTxHash(null);

      try {
        const currentChainId = await publicClient.getChainId();
        const resolverAddress = PUBLIC_RESOLVER[currentChainId];

        if (!resolverAddress) {
          setError(`ENS resolver not available on chain ${currentChainId}`);
          return null;
        }

        const normalized = normalize(ensName);
        const node = namehash(normalized);
        const textRecords = dataToTextRecords(data);

        if (textRecords.size === 0) {
          setError("No records to update");
          return null;
        }

        const calls: `0x${string}`[] = [];
        for (const [key, value] of textRecords) {
          const callData = encodeFunctionData({
            abi: PUBLIC_RESOLVER_ABI,
            functionName: "setText",
            args: [node, key, value],
          });
          calls.push(callData);
        }

        const multicallData = encodeFunctionData({
          abi: PUBLIC_RESOLVER_ABI,
          functionName: "multicall",
          args: [calls],
        });

        const hash = await walletClient.sendTransaction({
          to: resolverAddress,
          data: multicallData,
        });

        setUpdateTxHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });

        return hash;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Transaction failed";
        setError(message);
        return null;
      } finally {
        setIsUpdating(false);
      }
    },
    [publicClient, walletClient]
  );

  // ===========================================================================
  // Clear
  // ===========================================================================

  const clear = useCallback(() => {
    setAvailability(null);
    setClaimTxHash(null);
    setUpdateTxHash(null);
    setError(null);
    setConfirmationStatus("none");
    setDomain(null);
    setAgents([]);
  }, []);

  return {
    // Subdomain claiming
    checkAvailability,
    claimSubdomain,
    checkCanClaim,
    availability,
    canClaim,
    isCheckingAvailability,
    isClaiming,
    confirmationStatus,
    claimTxHash,

    // Agent fetching
    agents,
    domain,
    fetchAgents,
    fetchSubdomains,

    // Record updating
    updateRecords,
    isUpdating,
    updateTxHash,

    // Shared state
    isLoading,
    error,
    clear,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function parseDomain(data: SubgraphDomain): ENSDomain {
  return {
    name: data.name,
    label: data.labelName,
    owner: data.owner?.id ?? null,
    subdomainCount: data.subdomainCount ?? data.subdomains?.length ?? 0,
    subdomains: (data.subdomains ?? []).map(parseSubdomain),
  };
}

function parseSubdomain(data: SubgraphSubdomain): ENSSubdomain {
  return {
    id: data.id,
    name: data.name,
    label: data.labelName,
    owner: data.owner?.id ?? null,
    resolver: data.resolver
      ? { address: data.resolver.address as `0x${string}`, texts: data.resolver.texts ?? [] }
      : null,
    availableTextKeys: data.resolver?.texts ?? [],
    createdAt: new Date(parseInt(data.createdAt) * 1000),
  };
}

function parseAgentFromRecords(
  ensName: string,
  label: string,
  createdAt: Date,
  records: Record<string, string>
): Agent | null {
  const name = records[ENS_TEXT_KEYS.name];
  if (!name) return null;

  return {
    id: ensName,
    identity: {
      ensName,
      name,
      wallet: (records[ENS_TEXT_KEYS.wallet] ||
        "0x0000000000000000000000000000000000000000") as `0x${string}`,
      description: records[ENS_TEXT_KEYS.description] || "",
      avatar: records[ENS_TEXT_KEYS.avatar],
      version: records[ENS_TEXT_KEYS.version],
    },
    strategy: {
      id: records[ENS_TEXT_KEYS.strategyId] || label,
      pool: (records[ENS_TEXT_KEYS.strategyPool] ||
        "0x0000000000000000000000000000000000000000") as `0x${string}`,
      chainId: (Number(records[ENS_TEXT_KEYS.strategyChain]) || 1) as ChainId,
      risk: (records[ENS_TEXT_KEYS.strategyRisk] || "medium") as RiskLevel,
      protocol: (records[ENS_TEXT_KEYS.strategyProtocol] || "uniswap-v4") as Protocol,
      pair: records[ENS_TEXT_KEYS.strategyPair] || "",
      description: records[ENS_TEXT_KEYS.strategyDescription],
    },
    fees: {
      collect: Number(records[ENS_TEXT_KEYS.feeCollect]) || 0,
      rebalance: Number(records[ENS_TEXT_KEYS.feeRebalance]) || 0,
      compound: Number(records[ENS_TEXT_KEYS.feeCompound]) || 0,
      rangeAdjust: Number(records[ENS_TEXT_KEYS.feeRangeAdjust]) || 0,
    },
    permissions: {
      permissions: records[ENS_TEXT_KEYS.permissions]
        ? (records[ENS_TEXT_KEYS.permissions].split(",").map((s) => s.trim()) as AgentPermission[])
        : [],
      contracts: records[ENS_TEXT_KEYS.contracts]
        ? (records[ENS_TEXT_KEYS.contracts].split(",").map((s) => s.trim()) as `0x${string}`[])
        : [],
    },
    stats: {
      tvl: 0,
      subscribers: 0,
      apy30d: 0,
      totalActions: 0,
      successRate: 0,
      uptime: 100,
      registeredAt: createdAt,
    },
    status: "active",
  };
}

function dataToTextRecords(data: Partial<ParsedAgentData>): Map<string, string> {
  const records = new Map<string, string>();

  if (data.name) records.set(ENS_TEXT_KEYS.name, data.name);
  if (data.description) records.set(ENS_TEXT_KEYS.description, data.description);
  if (data.wallet) records.set(ENS_TEXT_KEYS.wallet, data.wallet);
  if (data.avatar) records.set(ENS_TEXT_KEYS.avatar, data.avatar);
  if (data.version) records.set(ENS_TEXT_KEYS.version, data.version);

  if (data.strategyId) records.set(ENS_TEXT_KEYS.strategyId, data.strategyId);
  if (data.pool) records.set(ENS_TEXT_KEYS.strategyPool, data.pool);
  if (data.chainId) records.set(ENS_TEXT_KEYS.strategyChain, data.chainId.toString());
  if (data.risk) records.set(ENS_TEXT_KEYS.strategyRisk, data.risk);
  if (data.protocol) records.set(ENS_TEXT_KEYS.strategyProtocol, data.protocol);
  if (data.pair) records.set(ENS_TEXT_KEYS.strategyPair, data.pair);
  if (data.strategyDescription)
    records.set(ENS_TEXT_KEYS.strategyDescription, data.strategyDescription);

  if (data.collectFeePercent !== undefined) {
    records.set(ENS_TEXT_KEYS.feeCollect, Math.round(data.collectFeePercent * 100).toString());
  }
  if (data.rebalanceFeeUsd !== undefined) {
    records.set(
      ENS_TEXT_KEYS.feeRebalance,
      Math.round(data.rebalanceFeeUsd * 1_000_000).toString()
    );
  }
  if (data.compoundFeePercent !== undefined) {
    records.set(ENS_TEXT_KEYS.feeCompound, Math.round(data.compoundFeePercent * 100).toString());
  }
  if (data.rangeAdjustFeeUsd !== undefined) {
    records.set(
      ENS_TEXT_KEYS.feeRangeAdjust,
      Math.round(data.rangeAdjustFeeUsd * 1_000_000).toString()
    );
  }

  if (data.permissions && data.permissions.length > 0) {
    records.set(ENS_TEXT_KEYS.permissions, data.permissions.join(","));
  }
  if (data.contracts && data.contracts.length > 0) {
    records.set(ENS_TEXT_KEYS.contracts, data.contracts.join(","));
  }

  return records;
}
