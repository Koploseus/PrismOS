"use client";

/**
 * useAgentStatus Hook
 *
 * React hook for checking agent backend health and connectivity.
 * Polls the agent API health endpoint at configurable intervals.
 */

import { useState, useEffect, useCallback, useRef } from "react";

const AGENT_API_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:3001"
    : process.env.AGENT_API_URL ||
      process.env.NEXT_PUBLIC_AGENT_API_URL ||
      "http://localhost:3001";

const DEFAULT_POLL_INTERVAL_MS = 10_000;

export interface AgentStatus {
  /** Whether the agent backend is reachable */
  isOnline: boolean;
  /** Last time we checked the status */
  lastChecked: Date | null;
  /** Response latency in milliseconds */
  latency: number | null;
  /** Error message if offline */
  error: string | null;
  /** Is currently checking */
  isChecking: boolean;
}

export interface UseAgentStatusOptions {
  /** Poll interval in milliseconds (default: 10000) */
  pollInterval?: number;
  /** Whether to start polling immediately (default: true) */
  enabled?: boolean;
}

export function useAgentStatus(options?: UseAgentStatusOptions): AgentStatus & {
  refresh: () => Promise<void>;
  apiUrl: string;
} {
  const { pollInterval = DEFAULT_POLL_INTERVAL_MS, enabled = true } =
    options ?? {};

  const [isOnline, setIsOnline] = useState<boolean>(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const checkHealth = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsChecking(true);

    const startTime = performance.now();

    try {
      const response = await fetch(`${AGENT_API_URL}/api/health`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: abortControllerRef.current.signal,
      });

      if (!isMountedRef.current) return;

      const endTime = performance.now();
      const responseLatency = Math.round(endTime - startTime);

      if (response.ok) {
        setIsOnline(true);
        setLatency(responseLatency);
        setError(null);
      } else {
        setIsOnline(false);
        setLatency(responseLatency);
        setError(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (err) {
      if (!isMountedRef.current) return;

      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      const endTime = performance.now();
      const responseLatency = Math.round(endTime - startTime);

      setIsOnline(false);
      setLatency(responseLatency);
      setError(
        err instanceof Error ? err.message : "Failed to connect to agent"
      );
    } finally {
      if (isMountedRef.current) {
        setLastChecked(new Date());
        setIsChecking(false);
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    console.log("[useAgentStatus] Manual refresh triggered");
    await checkHealth();
  }, [checkHealth]);

  useEffect(() => {
    isMountedRef.current = true;

    if (!enabled) {
      return;
    }

    checkHealth();

    if (pollInterval > 0) {
      intervalRef.current = setInterval(() => {
        console.log("[useAgentStatus] Polling agent health...");
        checkHealth();
      }, pollInterval);
    }

    return () => {
      isMountedRef.current = false;

      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [checkHealth, pollInterval, enabled]);

  return {
    isOnline,
    lastChecked,
    latency,
    error,
    isChecking,
    refresh,
    apiUrl: AGENT_API_URL,
  };
}
