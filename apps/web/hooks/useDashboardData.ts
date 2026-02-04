"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api, isSuccess, UserSubscription } from "@/lib/api";
import { getAgentByEns } from "@/lib/agents";
import { SubscribedAgent, Agent } from "@/lib/types";
import { useENSSubdomains } from "./useENSSubdomains";
import { PRISMOS_DOMAIN } from "./useClaimSubdomain";

export interface UseDashboardDataResult {
  subscriptions: SubscribedAgent[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

function buildSubscribedAgent(
  sub: UserSubscription & { smartAccount: string },
  agent: Agent,
  positionData: { walletValueUsd: number; wbtcAmt: number; cbbtcAmt: number } | null
): SubscribedAgent {
  const totalFeesCollected = parseFloat(sub.totalFeesCollected) || 0;
  const totalCompounded = parseFloat(sub.totalFeesCompounded) || 0;
  const totalDistributed = parseFloat(sub.totalDistributed) || 0;
  const feesPaidToAgent = 0;
  const netYield = totalFeesCollected - feesPaidToAgent;

  const valueUsd = positionData?.walletValueUsd ?? 0;
  const token0Amount = positionData?.wbtcAmt ?? 0;
  const token1Amount = positionData?.cbbtcAmt ?? 0;

  return {
    agent,
    smartAccount: sub.smartAccount,
    position: {
      valueUsd,
      token0Amount,
      token0Symbol: "WBTC",
      token1Amount,
      token1Symbol: "cbBTC",
      rangeLower: 0.99,
      rangeUpper: 1.01,
      inRange: true,
      unclaimedFees: 0,
    },
    stats: {
      totalFeesCollected,
      totalCompounded: totalCompounded,
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
    recentActivity: [],
  };
}

function findAgentByEns(ensName: string, ensAgents: Agent[]): Agent | undefined {
  const lower = ensName.toLowerCase();
  return (
    ensAgents.find((a) => a.identity.ensName.toLowerCase() === lower) ?? getAgentByEns(ensName)
  );
}

export function useDashboardData(userAddress: string | undefined): UseDashboardDataResult {
  const [subscriptions, setSubscriptions] = useState<SubscribedAgent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const { fetchAgents } = useENSSubdomains();

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

      const userSubs = subsResponse.data.subscriptions;

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
          if (!agent) return null;

          let positionData: { walletValueUsd: number; wbtcAmt: number; cbbtcAmt: number } | null =
            null;

          try {
            const posRes = await api.getPosition(sub.smartAccount);
            if (isSuccess(posRes)) {
              // The position API returns wallet balances; map from PositionData shape
              const d = posRes.data;
              positionData = {
                walletValueUsd: parseFloat(d.position?.totalValueUSD ?? "0"),
                wbtcAmt: parseFloat(d.balances?.wbtc?.formatted ?? "0"),
                cbbtcAmt: parseFloat(d.balances?.cbbtc?.formatted ?? "0"),
              };
            }
          } catch {
            // Position data unavailable, use defaults
          }

          return buildSubscribedAgent(sub, agent, positionData);
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
