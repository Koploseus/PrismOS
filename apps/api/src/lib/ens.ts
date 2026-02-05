/**
 * Server-side ENS text record resolver.
 *
 * Reads prismos.* text records from ENS on mainnet
 * with an in-memory cache (1h TTL).
 */

import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
// Mirrored from apps/web/lib/ens.ts
const ENS_TEXT_KEYS = {
  name: "prismos.agent.name",
  description: "prismos.agent.description",
  wallet: "prismos.agent.wallet",
  avatar: "avatar",
  version: "prismos.agent.version",
  strategyId: "prismos.strategy.id",
  strategyPool: "prismos.strategy.pool",
  strategyChain: "prismos.strategy.chain",
  strategyRisk: "prismos.strategy.risk",
  strategyProtocol: "prismos.strategy.protocol",
  strategyPair: "prismos.strategy.pair",
  strategyDescription: "prismos.strategy.description",
  feeCollect: "prismos.fee.collect",
  feeRebalance: "prismos.fee.rebalance",
  feeCompound: "prismos.fee.compound",
  feeRangeAdjust: "prismos.fee.rangeAdjust",
  permissions: "prismos.permissions",
  contracts: "prismos.contracts",
} as const;

const ETH_RPC = process.env.ETH_RPC || "https://eth.llamarpc.com";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface AgentENSConfig {
  name: string | null;
  description: string | null;
  wallet: string | null;
  avatar: string | null;
  version: string | null;
  strategyId: string | null;
  strategyPool: string | null;
  strategyChain: number | null;
  strategyRisk: string | null;
  strategyProtocol: string | null;
  strategyPair: string | null;
  strategyDescription: string | null;
  feeCollectBps: number;
  feeRebalanceBps: number;
  feeCompoundBps: number;
  feeRangeAdjustBps: number;
  permissions: string | null;
  contracts: string | null;
}

interface CacheEntry {
  config: AgentENSConfig;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

function getMainnetClient() {
  return createPublicClient({
    chain: mainnet,
    transport: http(ETH_RPC),
  });
}

async function fetchTextRecord(
  client: ReturnType<typeof getMainnetClient>,
  ensName: string,
  key: string
): Promise<string | null> {
  try {
    const result = await client.getEnsText({
      name: normalize(ensName),
      key,
    });
    return result ?? null;
  } catch {
    return null;
  }
}

function parseBps(value: string | null, fallback: number = 0): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

export async function resolveAgentENS(ensName: string): Promise<AgentENSConfig> {
  const cacheKey = ensName.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.config;
  }

  const client = getMainnetClient();

  const keys = ENS_TEXT_KEYS;
  const [
    name,
    description,
    wallet,
    avatar,
    version,
    strategyId,
    strategyPool,
    strategyChain,
    strategyRisk,
    strategyProtocol,
    strategyPair,
    strategyDescription,
    feeCollect,
    feeRebalance,
    feeCompound,
    feeRangeAdjust,
    permissions,
    contracts,
  ] = await Promise.all([
    fetchTextRecord(client, ensName, keys.name),
    fetchTextRecord(client, ensName, keys.description),
    fetchTextRecord(client, ensName, keys.wallet),
    fetchTextRecord(client, ensName, keys.avatar),
    fetchTextRecord(client, ensName, keys.version),
    fetchTextRecord(client, ensName, keys.strategyId),
    fetchTextRecord(client, ensName, keys.strategyPool),
    fetchTextRecord(client, ensName, keys.strategyChain),
    fetchTextRecord(client, ensName, keys.strategyRisk),
    fetchTextRecord(client, ensName, keys.strategyProtocol),
    fetchTextRecord(client, ensName, keys.strategyPair),
    fetchTextRecord(client, ensName, keys.strategyDescription),
    fetchTextRecord(client, ensName, keys.feeCollect),
    fetchTextRecord(client, ensName, keys.feeRebalance),
    fetchTextRecord(client, ensName, keys.feeCompound),
    fetchTextRecord(client, ensName, keys.feeRangeAdjust),
    fetchTextRecord(client, ensName, keys.permissions),
    fetchTextRecord(client, ensName, keys.contracts),
  ]);

  const config: AgentENSConfig = {
    name,
    description,
    wallet,
    avatar,
    version,
    strategyId,
    strategyPool,
    strategyChain: strategyChain ? parseInt(strategyChain, 10) : null,
    strategyRisk,
    strategyProtocol,
    strategyPair,
    strategyDescription,
    feeCollectBps: parseBps(feeCollect, 1000), // default 10%
    feeRebalanceBps: parseBps(feeRebalance),
    feeCompoundBps: parseBps(feeCompound, 1000),
    feeRangeAdjustBps: parseBps(feeRangeAdjust),
    permissions,
    contracts,
  };

  cache.set(cacheKey, { config, fetchedAt: Date.now() });
  console.log(`[ens] Resolved ${ensName}: strategy=${strategyId}, fees=${feeCollect}bps`);

  return config;
}

export function clearENSCache(): void {
  cache.clear();
}
