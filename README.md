# PrismOS

> [!WARNING]
> **Experimental prototype — not production ready.** The current ZeroDev session key uses a
> temporary `SudoPolicy`, not the scoped `CallPolicy` described below. Do not delegate a wallet
> containing meaningful funds. The payment middleware also uses a custom pre-standard `X-Payment`
> flow and is bypassed in development; it is not yet a compliant production x402 integration.
> See [`docs/PRODUCT_TRUTH.md`](docs/PRODUCT_TRUTH.md) and
> [`docs/STRATEGY_2026.md`](docs/STRATEGY_2026.md) for the verified status and product direction.

**Current direction:** PrismOS — policy and execution gateway for autonomous onchain agents.

The marketplace described below is the original hackathon concept, retained as technical and
product history. It is **not** the current go-to-market plan. The 2026 operating plan prioritizes a
single B2B execution product and paid design partners before any marketplace work.

## The Problem

**For DeFi users:** Managing an LP position, investing is a full-time job — collecting fees, rebalancing, compounding, adjusting ranges. Most people don't have the time, tools, or expertise.

**For AI agent builders:** There's no viable business model. On-chain micropayments eat all the margin in gas fees. There's no distribution channel. There's no standard. Every agent reinvents the wheel.

## The Solution

**PrismOS is the protocol in between.**

It's a marketplace where DeFi agents register their strategies, users browse and subscribe, and every agent action is paid via x402 micropayments — settled gaslessly through Yellow Network state channels.

```
┌─────────────┐        ┌──────────────────┐        ┌─────────────┐
│             │        │                  │        │             │
│  🤖 Agents  │───────▶│   ◈ PrismOS      │◀───────│  👤 Users   │
│             │        │                  │        │             │
│ Register    │        │ Registry (ENS)   │        │ Browse      │
│ Set pricing │        │ Matching         │        │ Subscribe   │
│ Execute     │        │ Payment rail     │        │ Delegate    │
│ Get paid    │        │ (x402 + Yellow)  │        │ Earn yield  │
│             │        │                  │        │             │
└─────────────┘        └──────────────────┘        └─────────────┘
```

The architecture supports N agents from day one.

---

## 💡 How it works

### 1. Agent registers on PrismOS

An agent builder claims an ENS subname (`yieldbot.prismos.eth`) and publishes everything in text records — strategy, pricing, required permissions. That's it. The agent appears in the marketplace.

### 2. User subscribes

The user browses the catalog, picks an agent, and goes through a 4-step wizard:

| Step          | Action                                           | Tech                 |
| ------------- | ------------------------------------------------ | -------------------- |
| **Configure** | Set preferences (compound %, destination wallet) | ENS text records     |
| **Delegate**  | Grant a scoped session key to the agent          | ZeroDev (ERC-4337)   |
| **Fund**      | Open a payment channel with the agent            | Yellow state channel |
| **Deposit**   | Bridge or swap funds into the LP position        | LI.FI                |

### 3. Agent manages the position

The agent runs autonomously (cron every hour), reads the user's config from ENS, and acts on their behalf via session key:

| Action           | Trigger             | Agent fee         |
| ---------------- | ------------------- | ----------------- |
| **Collect** fees | Fees accrued > $1   | 10% of collected  |
| **Rebalance**    | Ratio deviates > 5% | $0.10 flat        |
| **Compound**     | After each collect  | 10% of compounded |
| **Adjust range** | High volatility     | $0.50 flat        |
| **Distribute**   | Surplus > threshold | Free              |

Every action triggers an x402 micropayment, settled instantly via Yellow — **zero gas**.

### 4. Yield reaches the user

The agent distributes surplus via LI.FI bridge to the user's destination wallet (e.g. Gnosis Pay for a Visa card). The split is fully configurable:

```
10 USDC collected
  ├── 1.0 USDC → Agent (10% fee via x402/Yellow)
  ├── 7.0 USDC → Compound (add liquidity)
  └── 2.0 USDC → LI.FI bridge → Gnosis Pay Card
```

---

## 🏗 Architecture

### ENS as coordination layer

ENS is not just a name resolver here. It's a **decentralized coordination protocol** for agent discovery, configuration, and pricing — no backend, no custom contracts.

```
◈ PrismOS uses 3 layers of ENS text records:

╔═══════════════════════════════════════════════════════════════╗
║  PROTOCOL — prismos.eth                                      ║
║                                                               ║
║  prismos.agents       = "yieldbot,alphavault,deltabot"       ║
║  prismos.version      = "1.0.0"                              ║
╚═══════════════════════════════════════════════════════════════╝
         │
         ▼
╔═══════════════════════════════════════════════════════════════╗
║  AGENT — yieldbot.prismos.eth                                ║
║                                                               ║
║  Identity                                                     ║
║  agent.name            = "YieldBot v1"                       ║
║  agent.wallet          = 0xAgent...                          ║
║  agent.description     = "Automated wETH/wstETH LP mgmt"     ║
║                                                               ║
║  Strategy                                                     ║
║  agent.strategy.id     = "eth-wsteth-lp-v4"                 ║
║  agent.strategy.pool   = 0xPool...                           ║
║  agent.strategy.chain  = "42161"                             ║
║  agent.strategy.risk   = "low"                               ║
║                                                               ║
║  Pricing                                                      ║
║  agent.fee.collect     = "1000"          (10% in bps)        ║
║  agent.fee.rebalance   = "100000"        ($0.10 USDC)        ║
║  agent.fee.compound    = "1000"          (10% in bps)        ║
║  agent.fee.rangeAdjust = "500000"        ($0.50 USDC)        ║
║                                                               ║
║  Permissions                                                  ║
║  agent.permissions     = "collect,modifyLiquidity,execute"   ║
║  agent.contracts       = "0xPosMgr,0xRouter,0xYellow"        ║
╚═══════════════════════════════════════════════════════════════╝

╔═══════════════════════════════════════════════════════════════╗
║  USER — alice.eth                                            ║
║                                                               ║
║  prismos.agent         = "yieldbot.prismos.eth"              ║
║  prismos.compound      = "70"            (70% reinvested)    ║
║  prismos.destination   = 0xGnosisPay...                      ║
║  prismos.destChain     = "100"           (Gnosis Chain)      ║
║  prismos.maxSpend      = "50"            (50 USDC/day max)   ║
╚═══════════════════════════════════════════════════════════════╝
```

The agent publishes its offer. The user publishes their preferences. Matching happens by reading both — **fully on-chain, fully verifiable, zero backend**.

### x402 over Yellow

This is PrismOS's core innovation. The standard x402 payment protocol settles on-chain — which kills micropayments with gas fees. We route x402 through Yellow Network state channels instead.

```
            Classic x402                         PrismOS x402
    ┌─────────────────────────┐        ┌─────────────────────────┐
    │                         │        │                         │
    │  Payment → On-chain tx  │        │  Payment → State update │
    │  Gas: $0.50+            │        │  Gas: $0               │
    │  Latency: 3-15s         │        │  Latency: <100ms        │
    │  100 payments = 100 txs │        │  100 payments = 1 tx    │
    │                         │        │  (daily batch settle)   │
    │  ❌ Not viable for      │        │                         │
    │     $0.10 agent fees    │        │  ✅ Viable even for     │
    │                         │        │     $0.01 agent fees    │
    └─────────────────────────┘        └─────────────────────────┘
```

The flow:

```
Setup (once):
  User ←→ Agent: open Yellow state channel (e.g. 5 USDC budget)

Each action:
  Agent → "collect needed, fee: 0.50 USDC"
  User  → signs state update off-chain (Yellow)
  Agent → verifies, executes action via session key

Settlement (1x/day):
  Yellow → batch settle on-chain (1 single tx for all payments)
```

### Session Keys (ZeroDev)

The user creates an ERC-4337 Smart Account and delegates a **scoped session key** to the agent wallet. The agent can act on the user's behalf but with strict guardrails:

```
┌───────────────────────────────────────────────┐
│  Session Key Scope                            │
│                                               │
│  ✅ PositionManager.collect()                 │
│  ✅ PositionManager.modifyLiquidity()         │
│  ✅ UniversalRouter.execute()                 │
│  ✅ YellowCustody.deposit()                   │
│  ❌ PositionManager.burn()      — BLOCKED     │
│  ❌ ERC20.transfer()            — BLOCKED     │
│                                               │
│  ⏰ Expires: 30 days                          │
│  💰 Max spend: user-configurable              │
│  🔒 Scope: only contracts declared by agent   │
└───────────────────────────────────────────────┘

The agent can manage your position.
The agent can NEVER withdraw your funds.
```

### Full Flow

```
Phase 0 — REGISTER (agent-side, once)
  Agent claims yieldbot.prismos.eth
  Agent writes metadata + pricing + permissions to ENS
  Agent appears in PrismOS catalog

         │
         ▼

Phase 1 — SUBSCRIBE (user-side, once)
  User browses catalog → selects agent
  Step 1: Configure preferences → ENS text records
  Step 2: Create ZeroDev Smart Account
  Step 3: Delegate session key → agent wallet
  Step 4: Open Yellow state channel (fund 5 USDC)

         │
         ▼

Phase 2 — DEPOSIT (LI.FI Composer)
  User has USDC on Polygon
  Agent executes via session key:
    LI.FI Composer: Swap → Bridge → Add Liquidity (1 tx)
  Result: LP position in user's smart account on Arbitrum

         │
         ▼

Phase 3 — MANAGE (Agent loop, every hour)
  For each subscriber:
    Read ENS config → Check position → Decide actions
    Collect → Rebalance → Compound → Adjust Range → Distribute
    Each action paid via x402 → Yellow (gasless)

         │
         ▼

Phase 4 — DISTRIBUTE
  Agent bridges surplus via LI.FI → Gnosis Pay wallet
  User receives yield on their Visa card 💳
```

---

## 🔧 Stack

| Layer              | Technology                            | Role                                            |
| ------------------ | ------------------------------------- | ----------------------------------------------- |
| **Agent Registry** | ENS text records                      | Agent discovery, pricing, permissions           |
| **User Config**    | ENS text records                      | Preferences, destination, agent selection       |
| **Smart Account**  | ZeroDev Kernel (ERC-4337)             | Account abstraction for users                   |
| **Session Keys**   | ZeroDev SDK                           | Scoped delegation to agent wallet               |
| **Yield Engine**   | Uniswap v4 PositionManager            | ETH/wstETH LP management                        |
| **Micropayments**  | x402 protocol (Coinbase)              | HTTP 402 payment standard                       |
| **Settlement**     | Yellow Network / Nitrolite (ERC-7824) | Gasless state channel payments                  |
| **Cross-chain**    | LI.FI SDK + Composer                  | Deposit from any chain, distribute to any chain |
| **Destination**    | Gnosis Pay                            | Yield → Visa card                               |
| **Frontend**       | Next.js + wagmi + RainbowKit          | Catalog, subscribe wizard, dashboard            |
| **Agent**          | Node.js + Hono + node-cron            | Autonomous execution loop                       |
| **Chain**          | Arbitrum                              | All protocols compatible                        |

**Custom smart contracts: zero.** 100% protocol composition.

---

## 📁 Project Structure

```
prismos/
├── apps/
│   ├── web/                          # Next.js frontend
│   │   └── src/
│   │       ├── components/
│   │       │   ├── AgentCatalog.tsx        # Browse agents
│   │       │   ├── AgentCard.tsx           # Agent card (pricing, stats)
│   │       │   ├── SubscribeFlow.tsx       # 4-step wizard
│   │       │   ├── DepositFlow.tsx         # LI.FI deposit
│   │       │   └── Dashboard.tsx           # Position + activity + config
│   │       ├── hooks/
│   │       │   ├── useAgentRegistry.ts     # Read ENS agent catalog
│   │       │   ├── useENSConfig.ts         # Read/write user preferences
│   │       │   ├── useSessionKey.ts        # ZeroDev session keys
│   │       │   └── useYellowChannel.ts     # Yellow channel status
│   │       └── lib/
│   │           ├── registry.ts             # ENS registry reader
│   │           ├── lifi.ts                 # LI.FI SDK config
│   │           ├── uniswap.ts              # v4 interactions
│   │           ├── yellow.ts               # Yellow SDK config
│   │           └── zerodev.ts              # Smart account config
│   │
│   └── agent/                        # Node.js autonomous agent
│       └── src/
│           ├── index.ts                    # Entry + cron scheduler
│           ├── server.ts                   # Hono API (x402 endpoints)
│           ├── registry/
│           │   └── register.ts             # ENS registration script
│           ├── x402/
│           │   ├── middleware.ts            # x402 payment middleware
│           │   └── yellowFacilitator.ts     # Yellow-backed x402
│           ├── strategies/
│           │   └── ethWsteth.ts            # ETH/wstETH strategy
│           ├── modules/
│           │   ├── monitor.ts              # Position monitoring
│           │   ├── collector.ts            # Fee collection
│           │   ├── rebalancer.ts           # Ratio rebalancing
│           │   ├── compounder.ts           # Auto-compound
│           │   ├── rangeAdjuster.ts        # Range adjustment
│           │   └── distributor.ts          # LI.FI distribution
│           ├── session/
│           │   └── signer.ts               # ZeroDev session key signer
│           └── yellow/
│               ├── channel.ts              # State channel mgmt
│               └── settlement.ts           # Batch settlement
│
├── packages/
│   └── shared/                       # Shared types & constants
│       ├── types.ts
│       ├── constants.ts
│       ├── ens-schema.ts              # ENS text record schema
│       └── x402-types.ts             # x402 payment types
│
└── package.json
```

---

## 🚀 Quickstart

### Prerequisites

- Node.js >= 20
- pnpm >= 9

### Install

```bash
git clone https://github.com/koplo/prismos.git
cd prismos
pnpm install
```

### Configure

```bash
cp .env.example .env
```

```env
# RPC
ARBITRUM_RPC_URL=https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY

# Agent wallet
AGENT_PRIVATE_KEY=0x...

# ZeroDev
ZERODEV_PROJECT_ID=...

# Yellow
YELLOW_PRIVATE_KEY=0x...

# LI.FI
LIFI_API_KEY=...

# ENS
ENS_DOMAIN=prismos.eth
```

### Register the agent (one-time)

```bash
pnpm --filter agent run register
```

### Run

```bash
# Terminal 1 — Frontend
pnpm --filter web dev

# Terminal 2 — Agent
pnpm --filter agent dev
```

Open `http://localhost:3000` → Browse catalog → Subscribe → Deposit → Watch the agent work.

---

## 🧠 Why a marketplace, not just an agent

|                   | Single agent                      | PrismOS marketplace                       |
| ----------------- | --------------------------------- | ----------------------------------------- |
| **Distribution**  | Agent finds its own users         | Users come to PrismOS and browse          |
| **Trust**         | Trust a random agent              | Session key scoped, pricing public in ENS |
| **Payments**      | Each agent invents its own system | x402 + Yellow standardized for all        |
| **Composability** | Monolithic                        | N agents × N strategies, plug-and-play    |
