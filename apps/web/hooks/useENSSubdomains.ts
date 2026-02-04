"use client";

import { useState, useCallback } from "react";
import { DEFAULT_ENS_CHAIN_ID, ENS_TEXT_KEYS, ALL_ENS_TEXT_KEYS } from "@/lib/ens";
import { namehash } from "viem/ens";
import type { SubgraphDomain, SubgraphSubdomain, DomainByNameQueryResult } from "@/lib/ens";
import { usePublicClient } from "wagmi";
import { ENS_REGISTRY_ABI } from "./useClaimSubdomain";
import type { Agent, AgentPermission, ChainId, RiskLevel, Protocol } from "@/lib/types";

export interface ENSSubdomain {
  /** Subdomain ID */
  id: string;
  /** Full ENS name (e.g., "yieldbot.myagents.eth") */
  name: string;
  /** Label only (e.g., "yieldbot") */
  label: string;
  /** Owner address */
  owner: string | null;
  /** Resolver address */
  resolver: {
    address: `0x${string}`;
    texts: string[];
  } | null;
  /** Available text record keys (from resolver) */
  availableTextKeys: string[];
  /** Creation timestamp */
  createdAt: Date;
}

export interface ENSDomain {
  /** Full ENS name (e.g., "myagents.eth") */
  name: string;
  /** Label only (e.g., "myagents") */
  label: string;
  /** Owner address */
  owner: string | null;
  /** Number of subdomains */
  subdomainCount: number;
  /** Subdomains */
  subdomains: ENSSubdomain[];
}

interface UseENSSubdomainsReturn {
  /** Fetched agents */
  agents: Agent[];
  /** Fetched domain data */
  domain: ENSDomain | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Fetch subdomains for a domain */
  fetchSubdomains: (domainName: string) => Promise<ENSDomain | null>;
  /** Fetch agents */
  fetchAgents: (domainName: string) => Promise<Agent[]>;
  /** Clear current data */
  clear: () => void;
}

/**
 * Hook to fetch ENS subdomains via API route
 */
export function useENSSubdomains(chainId: number = DEFAULT_ENS_CHAIN_ID): UseENSSubdomainsReturn {
  const publicClient = usePublicClient();

  const [domain, setDomain] = useState<ENSDomain | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [agents, setAgents] = useState<Agent[]>([]);

  const fetchSubdomains = useCallback(
    async (domainName: string): Promise<ENSDomain | null> => {
      // Normalize domain name
      const normalizedName = domainName.toLowerCase().trim();
      if (!normalizedName) {
        setError("Please enter a domain name");
        return null;
      }

      // Ensure it ends with .eth
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

        const domainData = domains[0];
        const parsedDomain = parseDomain(domainData);
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
      const domain = await fetchSubdomains(domainName);

      if (!domain || !publicClient) {
        setAgents([]);
        return [];
      }

      const subdomainsWithResolver = domain.subdomains.filter((sub) => sub.resolver);
      if (subdomainsWithResolver.length === 0) {
        setAgents([]);
        return [];
      }

      // Build multicall requests: all subdomains × all known text keys
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

          // Build a record of key → value from successful results
          const records: Record<string, string> = {};
          for (let j = 0; j < ALL_ENS_TEXT_KEYS.length; j++) {
            const result = subResults[j];
            if (result.status === "success" && result.result) {
              records[ALL_ENS_TEXT_KEYS[j]] = result.result as string;
            }
          }

          const agent = parseAgent(sub.name, sub.label, sub.createdAt, records);
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

  const clear = useCallback(() => {
    setDomain(null);
    setError(null);
  }, []);

  return {
    agents,
    domain,
    isLoading,
    error,
    fetchSubdomains,
    fetchAgents,
    clear,
  };
}

/**
 * Parse subgraph domain data into our format
 */
function parseDomain(data: SubgraphDomain): ENSDomain {
  return {
    name: data.name,
    label: data.labelName,
    owner: data.owner?.id ?? null,
    subdomainCount: data.subdomainCount ?? data.subdomains?.length ?? 0,
    subdomains: (data.subdomains ?? []).map(parseSubdomain),
  };
}

/**
 * Parse subgraph subdomain data into our format
 */
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

function parseAgent(
  ensName: string,
  label: string,
  createdAt: Date,
  records: Record<string, string>
): Agent | null {
  // Require at least a name to consider this a valid agent
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
