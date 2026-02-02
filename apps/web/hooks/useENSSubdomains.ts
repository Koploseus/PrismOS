"use client";

import { useState, useCallback } from "react";
import { DEFAULT_ENS_CHAIN_ID } from "@/lib/ens";
import type {
  SubgraphDomain,
  SubgraphSubdomain,
  DomainByNameQueryResult,
} from "@/lib/ens/subgraph";

export interface ENSSubdomain {
  /** Full ENS name (e.g., "yieldbot.myagents.eth") */
  name: string;
  /** Label only (e.g., "yieldbot") */
  label: string;
  /** Owner address */
  owner: string | null;
  /** Resolver address */
  resolver: string | null;
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
  /** Fetched domain data */
  domain: ENSDomain | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Fetch subdomains for a domain */
  fetchSubdomains: (domainName: string) => Promise<void>;
  /** Clear current data */
  clear: () => void;
}

/**
 * Hook to fetch ENS subdomains via API route
 */
export function useENSSubdomains(chainId: number = DEFAULT_ENS_CHAIN_ID): UseENSSubdomainsReturn {
  const [domain, setDomain] = useState<ENSDomain | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSubdomains = useCallback(
    async (domainName: string) => {
      // Normalize domain name
      const normalizedName = domainName.toLowerCase().trim();
      if (!normalizedName) {
        setError("Please enter a domain name");
        return;
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
          return;
        }

        const domainData = domains[0];
        const parsedDomain = parseDomain(domainData);
        setDomain(parsedDomain);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch subdomains";
        setError(message);
        setDomain(null);
      } finally {
        setIsLoading(false);
      }
    },
    [chainId]
  );

  const clear = useCallback(() => {
    setDomain(null);
    setError(null);
  }, []);

  return {
    domain,
    isLoading,
    error,
    fetchSubdomains,
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
    name: data.name,
    label: data.labelName,
    owner: data.owner?.id ?? null,
    resolver: data.resolver?.address ?? null,
    availableTextKeys: data.resolver?.texts ?? [],
    createdAt: new Date(parseInt(data.createdAt) * 1000),
  };
}
