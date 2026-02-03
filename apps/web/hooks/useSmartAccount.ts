"use client";

/**
 * useSmartAccount Hook
 *
 * React hook for managing ZeroDev Smart Accounts in PrismOS.
 * Handles smart account creation and session key delegation to agents.
 */

import { useState, useCallback } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { Address } from "viem";
import {
  createSmartAccount,
  createSessionKey,
  SmartAccountInfo,
  SessionKeyGrant,
} from "@/lib/zerodev";

const ZERODEV_PROJECT_ID = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID || "";

export function useSmartAccount() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [smartAccount, setSmartAccount] = useState<SmartAccountInfo | null>(null);
  const [sessionKey, setSessionKey] = useState<SessionKeyGrant | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initSmartAccount = useCallback(async (): Promise<SmartAccountInfo | null> => {
    console.log("[useSmartAccount] initSmartAccount called");
    console.log("[useSmartAccount] isConnected:", isConnected);
    console.log("[useSmartAccount] walletClient:", !!walletClient);

    if (!walletClient || !isConnected) {
      const errorMsg = "Wallet not connected";
      console.log("[useSmartAccount] Error:", errorMsg);
      setError(errorMsg);
      return null;
    }

    if (!ZERODEV_PROJECT_ID) {
      const errorMsg = "ZeroDev project ID not configured";
      console.log("[useSmartAccount] Error:", errorMsg);
      setError(errorMsg);
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      console.log("[useSmartAccount] Creating smart account...");
      const account = await createSmartAccount(walletClient, ZERODEV_PROJECT_ID);
      console.log("[useSmartAccount] Smart account created:", account.address);
      setSmartAccount(account);
      return account;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to create smart account";
      console.error("[useSmartAccount] Error creating smart account:", errorMsg);
      setError(errorMsg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [walletClient, isConnected]);

  const delegateToAgent = useCallback(
    async (agentAddress: Address): Promise<SessionKeyGrant | null> => {
      console.log("[useSmartAccount] delegateToAgent called");
      console.log("[useSmartAccount] agentAddress:", agentAddress);
      console.log("[useSmartAccount] smartAccount:", smartAccount?.address);

      if (!walletClient || !smartAccount) {
        const errorMsg = "Smart account not initialized";
        console.log("[useSmartAccount] Error:", errorMsg);
        setError(errorMsg);
        return null;
      }

      if (!ZERODEV_PROJECT_ID) {
        const errorMsg = "ZeroDev project ID not configured";
        console.log("[useSmartAccount] Error:", errorMsg);
        setError(errorMsg);
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        console.log("[useSmartAccount] Creating session key for agent...");
        const grant = await createSessionKey(walletClient, agentAddress, ZERODEV_PROJECT_ID);
        console.log("[useSmartAccount] Session key created:", grant.sessionKeyAddress);
        setSessionKey(grant);
        return grant;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Failed to create session key";
        console.error("[useSmartAccount] Error creating session key:", errorMsg);
        setError(errorMsg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [walletClient, smartAccount]
  );

  const reset = useCallback(() => {
    console.log("[useSmartAccount] Resetting state");
    setSmartAccount(null);
    setSessionKey(null);
    setError(null);
  }, []);

  return {
    smartAccount,
    sessionKey,
    loading,
    error,
    isConnected,
    ownerAddress: address,

    initSmartAccount,
    delegateToAgent,
    reset,

    hasSmartAccount: !!smartAccount,
    hasSessionKey: !!sessionKey,
  };
}
