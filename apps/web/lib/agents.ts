import { Agent } from "./types";

/**
 * Agent Registry for PrismOS
 * 
 * Production: Fetched from ENS text records (prismos.eth → agents)
 * Hackathon: Static registry with real deployed agent on Base
 */
export const AGENTS: Agent[] = [
  {
    id: "prismos-base",
    identity: {
      ensName: "prismos.eth",
      name: "PrismOS Base Agent",
      wallet: "0xF4874485E3e8844b04577A646EdB0a9E6a5E0c68",
      description:
        "Autonomous WBTC/cbBTC LP management on Base. Optimizes range, collects fees, and compounds automatically. Non-custodial via session keys.",
      version: "1.0.0",
    },
    strategy: {
      id: "wbtc-cbbtc-stable-v4",
      pool: "0x119e84276578b845bee46a85be30924b7739c151dadaad4f42d6f5869f60a6a3",
      chainId: 8453,
      risk: "low",
      protocol: "uniswap-v4",
      pair: "WBTC/cbBTC",
      description: "Stable BTC pair strategy with minimal impermanent loss. WBTC and cbBTC are both 1:1 backed Bitcoin, so IL is near zero.",
    },
    fees: {
      collect: 1000,      // 10%
      rebalance: 100000,  // $0.10
      compound: 1000,     // 10%
      rangeAdjust: 500000, // $0.50
    },
    permissions: {
      permissions: ["collect", "modifyLiquidity", "compound"],
      contracts: [
        "0x7C5f5A4bBd8fD63184577525326123B519429bDc", // Base PositionManager V4
        "0x6ff5693b99212da76ad316178a184ab56d299b43", // Base Universal Router
        "0x0555E30da8f98308EdB960aa94C0Db47230d2B9c", // WBTC
        "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", // cbBTC
      ],
    },
    stats: {
      tvl: 0,
      subscribers: 0,
      apy30d: 0,
      totalActions: 1,
      successRate: 100,
      uptime: 100,
      registeredAt: new Date("2026-02-01"),
    },
    status: "active",
  },
];

export function getAgentById(id: string): Agent | undefined {
  return AGENTS.find((agent) => agent.id === id);
}

export function getAgentByEns(ensName: string): Agent | undefined {
  return AGENTS.find(
    (agent) => agent.identity.ensName.toLowerCase() === ensName.toLowerCase()
  );
}

export function getAgentsByChain(chainId: number): Agent[] {
  return AGENTS.filter((agent) => agent.strategy.chainId === chainId);
}

export function getActiveAgents(): Agent[] {
  return AGENTS.filter((agent) => agent.status === "active");
}

// Backward compatibility - to be removed
export const MOCK_AGENTS = AGENTS;
