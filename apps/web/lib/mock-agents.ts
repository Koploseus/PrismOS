import { Agent } from "./types";

/**
 * Mock agents for development and demo purposes.
 * In production, these would be fetched from ENS text records.
 */
export const MOCK_AGENTS: Agent[] = [
  {
    id: "yieldbot",
    identity: {
      ensName: "yieldbot.prismos.eth",
      name: "YieldBot v2",
      wallet: "0x1234567890abcdef1234567890abcdef12345678",
      description:
        "Automated ETH/wstETH LP management on Uniswap v4. Optimizes range, compounds fees, and rebalances automatically to maximize staking yield.",
      version: "2.1.0",
    },
    strategy: {
      id: "eth-wsteth-lp-v4",
      pool: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
      chainId: 42161,
      risk: "low",
      protocol: "uniswap-v4",
      pair: "ETH/wstETH",
      description: "Conservative strategy optimized for stable ETH-correlated pairs",
    },
    fees: {
      collect: 1000, // 10%
      rebalance: 100000, // $0.10
      compound: 1000, // 10%
      rangeAdjust: 500000, // $0.50
    },
    permissions: {
      permissions: ["collect", "modifyLiquidity", "execute", "compound"],
      contracts: [
        "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", // PositionManager
        "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", // UniversalRouter
        "0x0000000000000000000000000000000000Yellow", // Yellow Custody
      ],
    },
    stats: {
      tvl: 2_450_000,
      subscribers: 142,
      apy30d: 8.4,
      totalActions: 12_847,
      successRate: 99.7,
      uptime: 99.99,
      registeredAt: new Date("2024-06-15"),
    },
    status: "active",
  },
  {
    id: "alphavault",
    identity: {
      ensName: "alphavault.prismos.eth",
      name: "AlphaVault",
      wallet: "0xabcdef1234567890abcdef1234567890abcdef12",
      description:
        "Aggressive USDC/ETH LP strategy with dynamic range adjustment. Higher fees, higher potential returns. Best for experienced DeFi users.",
      version: "1.3.0",
    },
    strategy: {
      id: "usdc-eth-aggressive-v4",
      pool: "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
      chainId: 42161,
      risk: "high",
      protocol: "uniswap-v4",
      pair: "USDC/ETH",
      description: "Aggressive strategy with tight ranges for maximum fee capture",
    },
    fees: {
      collect: 1500, // 15%
      rebalance: 200000, // $0.20
      compound: 1500, // 15%
      rangeAdjust: 750000, // $0.75
    },
    permissions: {
      permissions: ["collect", "modifyLiquidity", "execute", "compound", "swap"],
      contracts: [
        "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
        "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
        "0x0000000000000000000000000000000000Yellow",
      ],
    },
    stats: {
      tvl: 890_000,
      subscribers: 67,
      apy30d: 24.2,
      totalActions: 8_234,
      successRate: 98.9,
      uptime: 99.95,
      registeredAt: new Date("2024-09-01"),
    },
    status: "active",
  },
  {
    id: "deltabot",
    identity: {
      ensName: "deltabot.prismos.eth",
      name: "DeltaBot",
      wallet: "0x567890abcdef1234567890abcdef1234567890ab",
      description:
        "Delta-neutral stablecoin LP strategy. Manages USDC/USDT positions with minimal impermanent loss. Ideal for conservative yield farming.",
      version: "1.0.5",
    },
    strategy: {
      id: "stable-stable-neutral",
      pool: "0x3416cF6C708Da44DB2624D63ea0AAef7113527C6",
      chainId: 42161,
      risk: "low",
      protocol: "uniswap-v4",
      pair: "USDC/USDT",
      description: "Ultra-conservative stablecoin strategy with minimal IL risk",
    },
    fees: {
      collect: 500, // 5%
      rebalance: 50000, // $0.05
      compound: 500, // 5%
      rangeAdjust: 100000, // $0.10
    },
    permissions: {
      permissions: ["collect", "modifyLiquidity", "compound"],
      contracts: [
        "0x3416cF6C708Da44DB2624D63ea0AAef7113527C6",
        "0x0000000000000000000000000000000000Yellow",
      ],
    },
    stats: {
      tvl: 5_200_000,
      subscribers: 312,
      apy30d: 4.8,
      totalActions: 45_123,
      successRate: 99.99,
      uptime: 100,
      registeredAt: new Date("2024-03-20"),
    },
    status: "active",
  },
  {
    id: "baserunner",
    identity: {
      ensName: "baserunner.prismos.eth",
      name: "BaseRunner",
      wallet: "0xcdef1234567890abcdef1234567890abcdef1234",
      description:
        "Optimized for Base chain. Manages ETH/cbETH positions with low fees thanks to Base's cheap transactions. Perfect for smaller positions.",
      version: "1.1.0",
    },
    strategy: {
      id: "eth-cbeth-base",
      pool: "0x4C36388bE6F416A29C8d8Eee81C771cE6bE14B18",
      chainId: 8453,
      risk: "low",
      protocol: "uniswap-v4",
      pair: "ETH/cbETH",
      description: "Low-cost strategy optimized for Base chain",
    },
    fees: {
      collect: 800, // 8%
      rebalance: 25000, // $0.025
      compound: 800, // 8%
      rangeAdjust: 100000, // $0.10
    },
    permissions: {
      permissions: ["collect", "modifyLiquidity", "execute", "compound"],
      contracts: [
        "0x4C36388bE6F416A29C8d8Eee81C771cE6bE14B18",
        "0x0000000000000000000000000000000000Yellow",
      ],
    },
    stats: {
      tvl: 780_000,
      subscribers: 89,
      apy30d: 7.2,
      totalActions: 6_891,
      successRate: 99.8,
      uptime: 99.97,
      registeredAt: new Date("2024-11-10"),
    },
    status: "active",
  },
  {
    id: "camelothunter",
    identity: {
      ensName: "camelothunter.prismos.eth",
      name: "Camelot Hunter",
      wallet: "0xef1234567890abcdef1234567890abcdef123456",
      description:
        "Specialized for Camelot DEX on Arbitrum. Hunts for the best ARB/ETH LP opportunities with spNFT boosting and nitro pool rewards.",
      version: "2.0.0",
    },
    strategy: {
      id: "arb-eth-camelot-v2",
      pool: "0x6c4f11d8C5B3E1e7B5B3A8C9C9C9C9C9C9C9C9C9",
      chainId: 42161,
      risk: "medium",
      protocol: "camelot",
      pair: "ARB/ETH",
      description: "Camelot-optimized strategy with spNFT boosting",
    },
    fees: {
      collect: 1200, // 12%
      rebalance: 150000, // $0.15
      compound: 1200, // 12%
      rangeAdjust: 400000, // $0.40
    },
    permissions: {
      permissions: ["collect", "modifyLiquidity", "execute", "compound", "swap"],
      contracts: [
        "0x6c4f11d8C5B3E1e7B5B3A8C9C9C9C9C9C9C9C9C9",
        "0x1F721E2E82F6676FCE4eA07A5958cF098D339e18",
        "0x0000000000000000000000000000000000Yellow",
      ],
    },
    stats: {
      tvl: 1_340_000,
      subscribers: 98,
      apy30d: 18.6,
      totalActions: 9_456,
      successRate: 99.2,
      uptime: 99.9,
      registeredAt: new Date("2024-08-05"),
    },
    status: "active",
  },
  {
    id: "aeroglide",
    identity: {
      ensName: "aeroglide.prismos.eth",
      name: "AeroGlide",
      wallet: "0x34567890abcdef1234567890abcdef1234567890",
      description:
        "Aerodrome specialist on Base. Maximizes veAERO rewards and bribes. Auto-compounds AERO emissions into more LP positions.",
      version: "1.2.0",
    },
    strategy: {
      id: "aero-usdc-base",
      pool: "0x7f90e1F2b4E8E5B8C8C8C8C8C8C8C8C8C8C8C8C8",
      chainId: 8453,
      risk: "medium",
      protocol: "aerodrome",
      pair: "AERO/USDC",
      description: "Aerodrome rewards maximizer with veAERO boosting",
    },
    fees: {
      collect: 1000, // 10%
      rebalance: 100000, // $0.10
      compound: 1000, // 10%
      rangeAdjust: 300000, // $0.30
    },
    permissions: {
      permissions: ["collect", "modifyLiquidity", "execute", "compound", "swap"],
      contracts: [
        "0x7f90e1F2b4E8E5B8C8C8C8C8C8C8C8C8C8C8C8C8",
        "0x0000000000000000000000000000000000Yellow",
      ],
    },
    stats: {
      tvl: 620_000,
      subscribers: 54,
      apy30d: 32.5,
      totalActions: 4_567,
      successRate: 99.4,
      uptime: 99.85,
      registeredAt: new Date("2024-10-22"),
    },
    status: "active",
  },
];

/** Get agent by ID */
export function getAgentById(id: string): Agent | undefined {
  return MOCK_AGENTS.find((agent) => agent.id === id);
}

/** Get agents by chain */
export function getAgentsByChain(chainId: number): Agent[] {
  return MOCK_AGENTS.filter((agent) => agent.strategy.chainId === chainId);
}

/** Get agents by risk level */
export function getAgentsByRisk(risk: "low" | "medium" | "high"): Agent[] {
  return MOCK_AGENTS.filter((agent) => agent.strategy.risk === risk);
}

/** Get active agents only */
export function getActiveAgents(): Agent[] {
  return MOCK_AGENTS.filter((agent) => agent.status === "active");
}
