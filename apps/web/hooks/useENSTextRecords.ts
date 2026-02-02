"use client";

import { useState, useCallback } from "react";
import { normalize } from "viem/ens";
import { usePublicClient } from "wagmi";
import { ALL_ENS_TEXT_KEYS, ENS_TEXT_KEYS } from "@/lib/ens";
import type { ChainId, RiskLevel, Protocol, AgentPermission } from "@/lib/types";

/**
 * Raw text records fetched from ENS
 */
export interface ENSTextRecords {
  // Identity
  name: string | null;
  description: string | null;
  wallet: string | null;
  avatar: string | null;
  version: string | null;

  // Strategy
  strategyId: string | null;
  strategyPool: string | null;
  strategyChain: string | null;
  strategyRisk: string | null;
  strategyProtocol: string | null;
  strategyPair: string | null;
  strategyDescription: string | null;

  // Fees
  feeCollect: string | null;
  feeRebalance: string | null;
  feeCompound: string | null;
  feeRangeAdjust: string | null;

  // Permissions
  permissions: string | null;
  contracts: string | null;
}

/**
 * Parsed agent data from text records
 */
export interface ParsedAgentData {
  // Identity
  name: string;
  description: string;
  wallet: string;
  avatar?: string;
  version?: string;

  // Strategy
  strategyId: string;
  pool: string;
  chainId: ChainId;
  risk: RiskLevel;
  protocol: Protocol;
  pair: string;
  strategyDescription?: string;

  // Fees (in display units)
  collectFeePercent: number;
  rebalanceFeeUsd: number;
  compoundFeePercent: number;
  rangeAdjustFeeUsd: number;

  // Permissions
  permissions: AgentPermission[];
  contracts: string[];
}

/**
 * Validation result for text records
 */
export interface ValidationResult {
  isValid: boolean;
  missingFields: string[];
  invalidFields: { field: string; reason: string }[];
}

interface UseENSTextRecordsReturn {
  /** Raw text records */
  records: ENSTextRecords | null;
  /** Parsed agent data */
  parsedData: ParsedAgentData | null;
  /** Validation result */
  validation: ValidationResult | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Fetch text records for an ENS name */
  fetchTextRecords: (ensName: string) => Promise<ParsedAgentData | null>;
  /** Clear current data */
  clear: () => void;
}

/**
 * Hook to fetch and parse ENS text records for an agent
 */
export function useENSTextRecords(): UseENSTextRecordsReturn {
  const publicClient = usePublicClient();
  const [records, setRecords] = useState<ENSTextRecords | null>(null);
  const [parsedData, setParsedData] = useState<ParsedAgentData | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTextRecords = useCallback(
    async (ensName: string): Promise<ParsedAgentData | null> => {
      if (!publicClient) {
        setError("No public client available");
        return null;
      }

      const normalizedName = ensName.toLowerCase().trim();
      if (!normalizedName) {
        setError("Please enter an ENS name");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Normalize the ENS name
        const normalized = normalize(normalizedName);

        // Fetch all text records in parallel
        const textRecordPromises = ALL_ENS_TEXT_KEYS.map(async (key) => {
          try {
            const value = await publicClient.getEnsText({
              name: normalized,
              key,
            });
            return { key, value };
          } catch {
            return { key, value: null };
          }
        });

        const results = await Promise.all(textRecordPromises);

        // Build records object
        const recordsMap = new Map(results.map(({ key, value }) => [key, value]));
        const fetchedRecords: ENSTextRecords = {
          name: recordsMap.get(ENS_TEXT_KEYS.name) ?? null,
          description: recordsMap.get(ENS_TEXT_KEYS.description) ?? null,
          wallet: recordsMap.get(ENS_TEXT_KEYS.wallet) ?? null,
          avatar: recordsMap.get(ENS_TEXT_KEYS.avatar) ?? null,
          version: recordsMap.get(ENS_TEXT_KEYS.version) ?? null,
          strategyId: recordsMap.get(ENS_TEXT_KEYS.strategyId) ?? null,
          strategyPool: recordsMap.get(ENS_TEXT_KEYS.strategyPool) ?? null,
          strategyChain: recordsMap.get(ENS_TEXT_KEYS.strategyChain) ?? null,
          strategyRisk: recordsMap.get(ENS_TEXT_KEYS.strategyRisk) ?? null,
          strategyProtocol: recordsMap.get(ENS_TEXT_KEYS.strategyProtocol) ?? null,
          strategyPair: recordsMap.get(ENS_TEXT_KEYS.strategyPair) ?? null,
          strategyDescription: recordsMap.get(ENS_TEXT_KEYS.strategyDescription) ?? null,
          feeCollect: recordsMap.get(ENS_TEXT_KEYS.feeCollect) ?? null,
          feeRebalance: recordsMap.get(ENS_TEXT_KEYS.feeRebalance) ?? null,
          feeCompound: recordsMap.get(ENS_TEXT_KEYS.feeCompound) ?? null,
          feeRangeAdjust: recordsMap.get(ENS_TEXT_KEYS.feeRangeAdjust) ?? null,
          permissions: recordsMap.get(ENS_TEXT_KEYS.permissions) ?? null,
          contracts: recordsMap.get(ENS_TEXT_KEYS.contracts) ?? null,
        };

        setRecords(fetchedRecords);

        // Parse and validate
        const parsed = parseTextRecords(fetchedRecords);
        setParsedData(parsed);

        const validationResult = validateTextRecords(fetchedRecords);
        setValidation(validationResult);

        return parsed;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch text records";
        setError(message);
        setRecords(null);
        setParsedData(null);
        setValidation(null);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [publicClient]
  );

  const clear = useCallback(() => {
    setRecords(null);
    setParsedData(null);
    setValidation(null);
    setError(null);
  }, []);

  return {
    records,
    parsedData,
    validation,
    isLoading,
    error,
    fetchTextRecords,
    clear,
  };
}

/**
 * Parse text records into agent data with defaults
 */
function parseTextRecords(records: ENSTextRecords): ParsedAgentData {
  const validChainIds: ChainId[] = [1, 42161, 8453, 11155111];
  const validRiskLevels: RiskLevel[] = ["low", "medium", "high"];
  const validProtocols: Protocol[] = ["uniswap-v4", "uniswap-v3", "aerodrome", "camelot"];
  const validPermissions: AgentPermission[] = [
    "collect",
    "modifyLiquidity",
    "execute",
    "swap",
    "bridge",
    "compound",
  ];

  // Parse chain ID
  const rawChainId = records.strategyChain ? parseInt(records.strategyChain) : 42161;
  const chainId: ChainId = validChainIds.includes(rawChainId as ChainId)
    ? (rawChainId as ChainId)
    : 42161;

  // Parse risk level
  const rawRisk = records.strategyRisk?.toLowerCase() as RiskLevel;
  const risk: RiskLevel = validRiskLevels.includes(rawRisk) ? rawRisk : "medium";

  // Parse protocol
  const rawProtocol = records.strategyProtocol?.toLowerCase() as Protocol;
  const protocol: Protocol = validProtocols.includes(rawProtocol) ? rawProtocol : "uniswap-v4";

  // Parse permissions (comma-separated)
  const rawPermissions = records.permissions?.split(",").map((p) => p.trim().toLowerCase()) ?? [];
  const permissions = rawPermissions.filter((p) =>
    validPermissions.includes(p as AgentPermission)
  ) as AgentPermission[];

  // Parse contracts (comma-separated)
  const contracts =
    records.contracts
      ?.split(",")
      .map((c) => c.trim())
      .filter((c) => c.startsWith("0x")) ?? [];

  // Parse fees (convert from basis points / microunits to display)
  const collectBps = records.feeCollect ? parseInt(records.feeCollect) : 1000;
  const rebalanceMicro = records.feeRebalance ? parseInt(records.feeRebalance) : 100000;
  const compoundBps = records.feeCompound ? parseInt(records.feeCompound) : 1000;
  const rangeAdjustMicro = records.feeRangeAdjust ? parseInt(records.feeRangeAdjust) : 500000;

  return {
    name: records.name ?? "",
    description: records.description ?? "",
    wallet: records.wallet ?? "",
    avatar: records.avatar ?? undefined,
    version: records.version ?? undefined,
    strategyId: records.strategyId ?? "",
    pool: records.strategyPool ?? "",
    chainId,
    risk,
    protocol,
    pair: records.strategyPair ?? "",
    strategyDescription: records.strategyDescription ?? undefined,
    collectFeePercent: collectBps / 100, // 1000 bps -> 10%
    rebalanceFeeUsd: rebalanceMicro / 1_000_000, // 100000 -> $0.10
    compoundFeePercent: compoundBps / 100,
    rangeAdjustFeeUsd: rangeAdjustMicro / 1_000_000,
    permissions: permissions.length > 0 ? permissions : ["collect", "modifyLiquidity", "compound"],
    contracts,
  };
}

/**
 * Validate text records for required fields
 */
function validateTextRecords(records: ENSTextRecords): ValidationResult {
  const missingFields: string[] = [];
  const invalidFields: { field: string; reason: string }[] = [];

  // Required fields
  if (!records.name) missingFields.push("Agent Name");
  if (!records.wallet) missingFields.push("Agent Wallet");
  if (!records.strategyPool) missingFields.push("Pool Address");
  if (!records.strategyChain) missingFields.push("Chain ID");
  if (!records.strategyPair) missingFields.push("Token Pair");
  if (!records.permissions) missingFields.push("Permissions");

  // Validate wallet address
  if (records.wallet && !records.wallet.startsWith("0x")) {
    invalidFields.push({ field: "Agent Wallet", reason: "Must be a valid Ethereum address" });
  }

  // Validate pool address
  if (records.strategyPool && !records.strategyPool.startsWith("0x")) {
    invalidFields.push({ field: "Pool Address", reason: "Must be a valid Ethereum address" });
  }

  // Validate chain ID
  if (records.strategyChain) {
    const chainId = parseInt(records.strategyChain);
    if (![1, 42161, 8453, 11155111].includes(chainId)) {
      invalidFields.push({
        field: "Chain ID",
        reason: "Must be 1 (Mainnet), 42161 (Arbitrum), 8453 (Base), or 11155111 (Sepolia)",
      });
    }
  }

  return {
    isValid: missingFields.length === 0 && invalidFields.length === 0,
    missingFields,
    invalidFields,
  };
}
