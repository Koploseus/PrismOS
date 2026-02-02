"use client";

import { useState, useCallback } from "react";
import { normalize, namehash } from "viem/ens";
import { encodeFunctionData, type Address } from "viem";
import { usePublicClient, useWalletClient } from "wagmi";
import { ENS_TEXT_KEYS } from "@/lib/ens";
import type { ParsedAgentData } from "./useENSTextRecords";

/**
 * Public Resolver ABI (only the functions we need)
 */
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

/**
 * Known ENS Public Resolver addresses by chain
 */
const PUBLIC_RESOLVER_ADDRESSES: Record<number, Address> = {
  1: "0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63", // Mainnet
  11155111: "0x8FADE66B79cC9f707aB26799354482EB93a5B7dD", // Sepolia
};

interface UpdateENSRecordsReturn {
  /** Prepare transaction data for updating records */
  prepareUpdate: (
    ensName: string,
    data: Partial<ParsedAgentData>
  ) => Promise<{ to: Address; data: `0x${string}` } | null>;
  /** Execute the update transaction */
  executeUpdate: (ensName: string, data: Partial<ParsedAgentData>) => Promise<`0x${string}` | null>;
  /** Loading state */
  isLoading: boolean;
  /** Transaction hash */
  txHash: `0x${string}` | null;
  /** Error message */
  error: string | null;
  /** Clear state */
  clear: () => void;
}

/**
 * Hook to update ENS text records
 *
 * The user must sign the transaction - we cannot do it on their behalf
 * unless they have approved us as an operator.
 */
export function useUpdateENSRecords(): UpdateENSRecordsReturn {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [isLoading, setIsLoading] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Convert ParsedAgentData to text record key-value pairs
   */
  const dataToTextRecords = useCallback((data: Partial<ParsedAgentData>): Map<string, string> => {
    const records = new Map<string, string>();

    // Identity
    if (data.name) records.set(ENS_TEXT_KEYS.name, data.name);
    if (data.description) records.set(ENS_TEXT_KEYS.description, data.description);
    if (data.wallet) records.set(ENS_TEXT_KEYS.wallet, data.wallet);
    if (data.avatar) records.set(ENS_TEXT_KEYS.avatar, data.avatar);
    if (data.version) records.set(ENS_TEXT_KEYS.version, data.version);

    // Strategy
    if (data.strategyId) records.set(ENS_TEXT_KEYS.strategyId, data.strategyId);
    if (data.pool) records.set(ENS_TEXT_KEYS.strategyPool, data.pool);
    if (data.chainId) records.set(ENS_TEXT_KEYS.strategyChain, data.chainId.toString());
    if (data.risk) records.set(ENS_TEXT_KEYS.strategyRisk, data.risk);
    if (data.protocol) records.set(ENS_TEXT_KEYS.strategyProtocol, data.protocol);
    if (data.pair) records.set(ENS_TEXT_KEYS.strategyPair, data.pair);
    if (data.strategyDescription)
      records.set(ENS_TEXT_KEYS.strategyDescription, data.strategyDescription);

    // Fees (convert to storage format)
    if (data.collectFeePercent !== undefined) {
      const bps = Math.round(data.collectFeePercent * 100); // 10% -> 1000 bps
      records.set(ENS_TEXT_KEYS.feeCollect, bps.toString());
    }
    if (data.rebalanceFeeUsd !== undefined) {
      const micro = Math.round(data.rebalanceFeeUsd * 1_000_000); // $0.10 -> 100000
      records.set(ENS_TEXT_KEYS.feeRebalance, micro.toString());
    }
    if (data.compoundFeePercent !== undefined) {
      const bps = Math.round(data.compoundFeePercent * 100);
      records.set(ENS_TEXT_KEYS.feeCompound, bps.toString());
    }
    if (data.rangeAdjustFeeUsd !== undefined) {
      const micro = Math.round(data.rangeAdjustFeeUsd * 1_000_000);
      records.set(ENS_TEXT_KEYS.feeRangeAdjust, micro.toString());
    }

    // Permissions
    if (data.permissions && data.permissions.length > 0) {
      records.set(ENS_TEXT_KEYS.permissions, data.permissions.join(","));
    }
    if (data.contracts && data.contracts.length > 0) {
      records.set(ENS_TEXT_KEYS.contracts, data.contracts.join(","));
    }

    return records;
  }, []);

  /**
   * Prepare the multicall transaction data for updating records
   */
  const prepareUpdate = useCallback(
    async (
      ensName: string,
      data: Partial<ParsedAgentData>
    ): Promise<{ to: Address; data: `0x${string}` } | null> => {
      if (!publicClient) {
        setError("No public client available");
        return null;
      }

      const chainId = await publicClient.getChainId();
      const resolverAddress = PUBLIC_RESOLVER_ADDRESSES[chainId];

      if (!resolverAddress) {
        setError(`ENS resolver not available on chain ${chainId}`);
        return null;
      }

      try {
        const normalized = normalize(ensName);
        const node = namehash(normalized);
        const textRecords = dataToTextRecords(data);

        if (textRecords.size === 0) {
          setError("No records to update");
          return null;
        }

        // Encode each setText call
        const calls: `0x${string}`[] = [];
        for (const [key, value] of textRecords) {
          const callData = encodeFunctionData({
            abi: PUBLIC_RESOLVER_ABI,
            functionName: "setText",
            args: [node, key, value],
          });
          calls.push(callData);
        }

        // Encode the multicall
        const multicallData = encodeFunctionData({
          abi: PUBLIC_RESOLVER_ABI,
          functionName: "multicall",
          args: [calls],
        });

        return {
          to: resolverAddress,
          data: multicallData,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to prepare transaction";
        setError(message);
        return null;
      }
    },
    [publicClient, dataToTextRecords]
  );

  /**
   * Execute the update transaction
   */
  const executeUpdate = useCallback(
    async (ensName: string, data: Partial<ParsedAgentData>): Promise<`0x${string}` | null> => {
      if (!walletClient) {
        setError("Please connect your wallet");
        return null;
      }

      setIsLoading(true);
      setError(null);
      setTxHash(null);

      try {
        const txData = await prepareUpdate(ensName, data);
        if (!txData) {
          setIsLoading(false);
          return null;
        }

        // Send the transaction (user signs)
        const hash = await walletClient.sendTransaction({
          to: txData.to,
          data: txData.data,
        });

        setTxHash(hash);

        // Wait for confirmation
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash });
        }

        return hash;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Transaction failed";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [walletClient, publicClient, prepareUpdate]
  );

  const clear = useCallback(() => {
    setTxHash(null);
    setError(null);
  }, []);

  return {
    prepareUpdate,
    executeUpdate,
    isLoading,
    txHash,
    error,
    clear,
  };
}
