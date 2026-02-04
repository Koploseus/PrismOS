import { getAgentById } from "./agents";
import { SubscribedAgent } from "./types";

/**
 * Active Subscriptions Display Data
 *
 * Production: Fetched from API → /api/subscribers
 * Hackathon: Static data showing real on-chain position
 */

const prismosAgent = getAgentById("prismos-base");

export const SUBSCRIBED_AGENTS: SubscribedAgent[] = [
  // Real position created on-chain: Token #1223514
  ...(prismosAgent
    ? [
        {
          agent: prismosAgent,
          smartAccount: "0x0000000000000000000000000000000000000000",
          position: {
            valueUsd: 2.54,
            token0Amount: 0.00001271, // WBTC
            token0Symbol: "WBTC",
            token1Amount: 0.00001273, // cbBTC
            token1Symbol: "cbBTC",
            rangeLower: 0.99,
            rangeUpper: 1.01,
            inRange: true,
            unclaimedFees: 0,
          },
          stats: {
            totalFeesCollected: 0,
            totalCompounded: 0,
            totalDistributed: 0,
            feesPaidToAgent: 0,
            netYield: 0,
            realizedApy: 0,
            actionsCount: {
              collect: 0,
              rebalance: 0,
              compound: 1,
              rangeAdjust: 0,
              distribute: 0,
            },
            subscribedAt: new Date("2026-02-02"),
          },
          recentActivity: [
            {
              id: "1",
              timestamp: new Date("2026-02-02T23:09:11Z"),
              type: "compound" as const,
              agentId: "prismos-base",
              txHash:
                "0xfee99cb854ae13d2030807011c94cff20286e0f0e490e12de76f9d14759a1f29" as `0x${string}`,
              amount: 2.54,
              fee: 0,
              status: "success" as const,
              details: "Created LP position #1223514 on WBTC/cbBTC pool",
            },
          ],
        },
      ]
    : []),
];

// Backward compatibility - to be removed
export const MOCK_SUBSCRIBED_AGENTS = SUBSCRIBED_AGENTS;
