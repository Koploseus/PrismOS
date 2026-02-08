"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api, isSuccess, UserSubscription, PositionData, TransactionSummary } from "@/lib/api";
import { SubscribedAgent, Agent, ActivityLog } from "@/lib/types";
import { useENS, PRISMOS_DOMAIN } from "./useENS";
import { formatUnits } from "viem";

export interface useDashboardResult {
  subscriptions: SubscribedAgent[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Build a SubscribedAgent from real API data.
 * Uses dynamic token symbols/amounts from the position endpoint.
 */
/** Map Zerion transaction operation_type to our ActivityType */
function mapTxType(tx: TransactionSummary): ActivityLog["type"] {
  const type = tx.type.toLowerCase();
  if (type === "trade" || type === "swap") return "collect";
  if (type === "mint" || type === "deposit") return "compound";
  if (type === "burn" || type === "withdraw") return "distribute";
  if (type === "approve") return "subscribe";
  return "collect";
}

function buildSubscribedAgent(
  sub: UserSubscription,
  agent: Agent,
  positionData: PositionData | null,
  transactions: TransactionSummary[]
): SubscribedAgent {
  const totalFeesCollected = parseFloat(sub.totalFeesCollected) || 0;
  const totalCompounded = parseFloat(sub.totalFeesCompounded) || 0;
  const totalDistributed = parseFloat(sub.totalDistributed) || 0;
  const feesPaidToAgent = 0;
  const netYield = totalFeesCollected - feesPaidToAgent;

  // Map position data from real API response
  const valueUsd = positionData?.walletValueUsd ?? 0;

  const token0Symbol = positionData?.token0Symbol ?? agent.strategy.pair.split("/")[0] ?? "TOKEN0";
  const token1Symbol = positionData?.token1Symbol ?? agent.strategy.pair.split("/")[1] ?? "TOKEN1";
  const token0Decimals = positionData?.token0Decimals ?? 18;
  const token1Decimals = positionData?.token1Decimals ?? 6;

  const token0Amount = positionData?.token0Balance
    ? Number(formatUnits(BigInt(positionData.token0Balance), token0Decimals))
    : 0;
  const token1Amount = positionData?.token1Balance
    ? Number(formatUnits(BigInt(positionData.token1Balance), token1Decimals))
    : 0;

  const lpValueUsd = positionData?.lpPositions?.valueUsd ?? 0;

  // Build recent activity from Zerion transactions + subscription event
  const recentActivity: ActivityLog[] = [];

  // Map Zerion transactions to ActivityLog
  for (const tx of transactions.slice(0, 20)) {
    const txType = mapTxType(tx);
    const inTransfers = tx.transfers.filter((t) => t.direction === "in");

    const details = tx.transfers
      .map((t) => `${t.direction === "out" ? "-" : "+"}${t.amount.toFixed(4)} ${t.symbol}`)
      .join(", ");

    recentActivity.push({
      id: tx.id,
      timestamp: new Date(tx.timestamp),
      type: txType,
      agentId: agent.id,
      txHash: tx.hash as `0x${string}`,
      amount: inTransfers.reduce((s, t) => s + (t.valueUsd ?? 0), 0) || undefined,
      fee: tx.fee.valueUsd ?? undefined,
      status: tx.status === "confirmed" ? "success" : tx.status === "failed" ? "failed" : "pending",
      details: details || tx.type,
    });
  }

  // Always add subscription event
  if (sub.subscribedAt) {
    recentActivity.push({
      id: `subscribe-${sub.smartAccount}`,
      timestamp: new Date(sub.subscribedAt),
      type: "subscribe",
      agentId: agent.id,
      status: "success",
      details: `Subscribed to ${agent.identity.name}`,
    });
  }

  return {
    agent,
    smartAccount: sub.smartAccount,
    position: {
      valueUsd: valueUsd > 0 ? valueUsd : lpValueUsd,
      token0Amount: positionData?.lpPositions?.token0Amount ?? token0Amount,
      token0Symbol,
      token1Amount: positionData?.lpPositions?.token1Amount ?? token1Amount,
      token1Symbol,
      rangeLower: positionData?.lpPositions?.tickLower ?? 0,
      rangeUpper: positionData?.lpPositions?.tickUpper ?? 0,
      inRange: positionData?.lpPositions?.inRange ?? positionData?.summary?.inRange ?? false,
      unclaimedFees: 0,
    },
    stats: {
      totalFeesCollected,
      totalCompounded,
      totalDistributed,
      feesPaidToAgent,
      netYield,
      realizedApy: 0,
      actionsCount: {
        collect: 0,
        rebalance: 0,
        compound: totalCompounded > 0 ? 1 : 0,
        rangeAdjust: 0,
        distribute: totalDistributed > 0 ? 1 : 0,
      },
      subscribedAt: new Date(sub.subscribedAt),
    },
    recentActivity,
  };
}

function findAgentByEns(ensName: string, ensAgents: Agent[]): Agent | undefined {
  const lower = ensName.toLowerCase();
  return ensAgents.find((a) => a.identity.ensName.toLowerCase() === lower);
}

export function useDashboard(userAddress: string | undefined): useDashboardResult {
  const [subscriptions, setSubscriptions] = useState<SubscribedAgent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const { fetchAgents } = useENS();

  const fetchData = useCallback(async () => {
    if (!userAddress) {
      setSubscriptions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch real agents from ENS and user subscriptions in parallel
      const [ensAgents, subsResponse] = await Promise.all([
        fetchAgents(PRISMOS_DOMAIN).catch(() => [] as Agent[]),
        api.getUserSubscriptions(userAddress),
      ]);

      if (!isSuccess(subsResponse)) {
        if (isMountedRef.current) {
          setError("Failed to fetch subscriptions");
          setSubscriptions([]);
          setIsLoading(false);
        }
        return;
      }

      // Filter out errored/revoked subscriptions
      const userSubs = subsResponse.data.subscriptions.filter(
        (s) => s.status !== "error" && s.status !== "revoked"
      );

      if (userSubs.length === 0) {
        if (isMountedRef.current) {
          setSubscriptions([]);
          setIsLoading(false);
        }
        return;
      }

      // Fetch position data for each subscription's smart account in parallel
      const results = await Promise.all(
        userSubs.map(async (sub) => {
          const agent = findAgentByEns(sub.agentEns, ensAgents);
          if (!agent) {
            console.warn(`[dashboard] No agent found for ENS: ${sub.agentEns}`);
            return null;
          }

          let positionData: PositionData | null = null;
          let transactions: TransactionSummary[] = [];

          try {
            const [posRes, txRes] = await Promise.all([
              api.getPosition(sub.smartAccount, sub.agentEns),
              api.getTransactions(sub.smartAccount, "ethereum", 20),
            ]);
            if (isSuccess(posRes)) {
              positionData = posRes.data;
            }
            if (isSuccess(txRes)) {
              transactions = txRes.data.transactions;
            }
          } catch {
            // Position/transaction data unavailable, use defaults
          }

          return buildSubscribedAgent(sub, agent, positionData, transactions);
        })
      );

      if (isMountedRef.current) {
        setSubscriptions(results.filter((r): r is SubscribedAgent => r !== null));
        setIsLoading(false);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard data");
        setSubscriptions([]);
        setIsLoading(false);
      }
    }
  }, [userAddress, fetchAgents]);

  const refresh = useCallback(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    isMountedRef.current = true;

    void (async () => {
      await fetchData();
    })();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchData]);

  return { subscriptions, isLoading, error, refresh };
}
