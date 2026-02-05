/**
 * In-memory fee accumulator.
 *
 * Tracks agent fees collected from LP positions.
 * Fees are accumulated until settlement threshold ($10) or 24h interval.
 */

const SETTLEMENT_THRESHOLD_USD = 10;

interface FeeEntry {
  agentEns: string;
  smartAccount: string;
  amountUsd: number;
  timestamp: number;
}

interface AccumulatedFees {
  totalUsd: number;
  entries: FeeEntry[];
}

const feeStore = new Map<string, AccumulatedFees>();

export function trackFee(agentEns: string, smartAccount: string, amountUsd: number): void {
  const key = agentEns.toLowerCase();
  const existing = feeStore.get(key) ?? { totalUsd: 0, entries: [] };

  existing.totalUsd += amountUsd;
  existing.entries.push({
    agentEns,
    smartAccount,
    amountUsd,
    timestamp: Date.now(),
  });

  feeStore.set(key, existing);
  console.log(
    `[feeTracker] Tracked $${amountUsd.toFixed(4)} for ${agentEns} (total: $${existing.totalUsd.toFixed(4)})`
  );
}

export function shouldSettle(): boolean {
  for (const [, fees] of feeStore) {
    if (fees.totalUsd >= SETTLEMENT_THRESHOLD_USD) return true;
  }
  return false;
}

export function getAccumulatedFees(): Map<string, AccumulatedFees> {
  return new Map(feeStore);
}

export function clearAccumulatedFees(): void {
  feeStore.clear();
  console.log("[feeTracker] Cleared all accumulated fees");
}

export function getFeeSummary(): { agent: string; totalUsd: number; entryCount: number }[] {
  const summary: { agent: string; totalUsd: number; entryCount: number }[] = [];
  for (const [agent, fees] of feeStore) {
    summary.push({
      agent,
      totalUsd: fees.totalUsd,
      entryCount: fees.entries.length,
    });
  }
  return summary;
}
