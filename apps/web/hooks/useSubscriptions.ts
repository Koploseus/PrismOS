"use client";

/**
 * useSubscriptions Hook
 *
 * React hook for managing user subscriptions from localStorage and optionally syncing with agent API.
 * Subscriptions are stored locally when created via SubscribeModal.
 */

import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "prismos_subscriptions";

export interface SubscriptionConfig {
  compound: number;
  destination: string;
  destChain: string;
}

export interface LocalSubscription {
  agentId: string;
  agentEns: string;
  agentWallet: string;
  smartAccount: string;
  sessionKeyAddress: string;
  serializedGrant: string;
  permissionId: string;
  config: SubscriptionConfig;
  timestamp: number;
}

export interface UseSubscriptionsOptions {
  /** Whether to start fetching immediately (default: true) */
  enabled?: boolean;
}

function getStoredSubscriptions(): LocalSubscription[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("[useSubscriptions] Failed to parse stored subscriptions");
    return [];
  }
}

export function useSubscriptions(options?: UseSubscriptionsOptions): {
  subscriptions: LocalSubscription[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  addSubscription: (subscription: LocalSubscription) => void;
  removeSubscription: (agentId: string) => void;
  clearAll: () => void;
  count: number;
} {
  const { enabled = true } = options ?? {};

  const [subscriptions, setSubscriptions] = useState<LocalSubscription[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);

  const loadSubscriptions = useCallback(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const stored = getStoredSubscriptions();
      if (isMountedRef.current) {
        setSubscriptions(stored);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load subscriptions");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [enabled]);

  const refresh = useCallback(() => {
    console.log("[useSubscriptions] Refreshing subscriptions from storage");
    loadSubscriptions();
  }, [loadSubscriptions]);

  const addSubscription = useCallback((subscription: LocalSubscription) => {
    setSubscriptions((prev) => {
      const existingIndex = prev.findIndex((s) => s.agentId === subscription.agentId);
      let updated: LocalSubscription[];

      if (existingIndex >= 0) {
        updated = [...prev];
        updated[existingIndex] = subscription;
      } else {
        updated = [...prev, subscription];
      }

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error("[useSubscriptions] Failed to save subscription:", err);
      }

      return updated;
    });
  }, []);

  const removeSubscription = useCallback((agentId: string) => {
    setSubscriptions((prev) => {
      const updated = prev.filter((s) => s.agentId !== agentId);

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (err) {
        console.error("[useSubscriptions] Failed to remove subscription:", err);
      }

      return updated;
    });
  }, []);

  const clearAll = useCallback(() => {
    setSubscriptions([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error("[useSubscriptions] Failed to clear subscriptions:", err);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadSubscriptions();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        console.log("[useSubscriptions] Storage changed, reloading...");
        loadSubscriptions();
      }
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      isMountedRef.current = false;
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [loadSubscriptions]);

  return {
    subscriptions,
    isLoading,
    error,
    refresh,
    addSubscription,
    removeSubscription,
    clearAll,
    count: subscriptions.length,
  };
}
