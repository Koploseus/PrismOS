/**
 * Server-side ENS text record resolver.
 *
 * Reads prismos.* text records from ENS on mainnet
 * with an in-memory cache (1h TTL).
 */

import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { CHAIN_CONFIGS, KNOWN_TOKENS } from "../../../../packages/shared/src/constants";
import type { StrategyConfig } from "../../../../packages/shared/src/types";
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
  strategyFeeTier: "prismos.strategy.feeTier",
  strategyDescription: "prismos.strategy.description",
  feeCollect: "prismos.fee.collect",
  feeRebalance: "prismos.fee.rebalance",
  feeCompound: "prismos.fee.compound",
  feeRangeAdjust: "prismos.fee.rangeAdjust",
  permissions: "prismos.permissions",
  contracts: "prismos.contracts",
} as const;

const ETH_RPC = process.env.ETH_RPC || "https://ethereum-rpc.publicnode.com";
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
  strategyFeeTier: number | null;
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

/** Fetch multiple ENS text records in batches to avoid RPC rate limiting */
async function fetchTextRecordsBatch(
  client: ReturnType<typeof getMainnetClient>,
  ensName: string,
  keys: string[]
): Promise<(string | null)[]> {
  const BATCH_SIZE = 6;
  const results: (string | null)[] = [];
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((key) => fetchTextRecord(client, ensName, key))
    );
    results.push(...batchResults);
  }
  return results;
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
  const allKeys = [
    keys.name,
    keys.description,
    keys.wallet,
    keys.avatar,
    keys.version,
    keys.strategyId,
    keys.strategyPool,
    keys.strategyChain,
    keys.strategyRisk,
    keys.strategyProtocol,
    keys.strategyPair,
    keys.strategyFeeTier,
    keys.strategyDescription,
    keys.feeCollect,
    keys.feeRebalance,
    keys.feeCompound,
    keys.feeRangeAdjust,
    keys.permissions,
    keys.contracts,
  ];
  const results = await fetchTextRecordsBatch(client, ensName, allKeys);
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
    strategyFeeTier,
    strategyDescription,
    feeCollect,
    feeRebalance,
    feeCompound,
    feeRangeAdjust,
    permissions,
    contracts,
  ] = results;

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
    strategyFeeTier: strategyFeeTier ? parseInt(strategyFeeTier, 10) : null,
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

export function resolveStrategyConfig(ensConfig: AgentENSConfig): StrategyConfig | null {
  const chainId = ensConfig.strategyChain;
  if (!chainId) return null;

  const chainConfig = CHAIN_CONFIGS[chainId];
  if (!chainConfig) {
    console.warn(`[ens] Chain ${chainId} not in CHAIN_CONFIGS`);
    return null;
  }

  let token0: `0x${string}` | null = null;
  let token1: `0x${string}` | null = null;
  let token0Decimals: number | null = null;
  let token1Decimals: number | null = null;

  const pair = ensConfig.strategyPair || "";
  const [sym0, sym1] = pair.split("/").map((s) => s.trim().toUpperCase());

  const chainTokens = KNOWN_TOKENS[chainId];
  if (chainTokens) {
    if (sym0 && chainTokens[sym0]) {
      token0 = chainTokens[sym0].address as `0x${string}`;
      token0Decimals = chainTokens[sym0].decimals;
      console.log(`[ens] Resolved token0 ${sym0} from KNOWN_TOKENS: ${token0}`);
    }
    if (sym1 && chainTokens[sym1]) {
      token1 = chainTokens[sym1].address as `0x${string}`;
      token1Decimals = chainTokens[sym1].decimals;
      console.log(`[ens] Resolved token1 ${sym1} from KNOWN_TOKENS: ${token1}`);
    }
  }

  if (!token0 || !token1) {
    console.warn(`[ens] Cannot resolve token addresses for pair=${pair}, chain=${chainId}`);
    return null;
  }

  return {
    chainId,
    pool: (ensConfig.strategyPool || "0x0000000000000000000000000000000000000000") as `0x${string}`,
    token0,
    token1,
    token0Decimals: token0Decimals ?? 18,
    token1Decimals: token1Decimals ?? 18,
    token0Symbol: sym0 || "TOKEN0",
    token1Symbol: sym1 || "TOKEN1",
    protocol: ensConfig.strategyProtocol || "uniswap-v4",
    positionManager: chainConfig.positionManager,
    permit2: chainConfig.permit2,
    poolManager: chainConfig.poolManager,
  };
}
