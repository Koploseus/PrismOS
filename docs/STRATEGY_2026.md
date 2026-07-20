# PrismOS — Business and Market Strategy 2026

**Decision date:** 20 July 2026  
**Horizon:** 12 months  
**Status:** working operating thesis, to be validated with paid buyers

## 1. Executive decision

### Verdict

PrismOS has **conditional business potential**, but the current “marketplace for DeFi agents” must not be the initial company.

The recommended company is:

> **PrismOS is the policy and execution gateway for autonomous onchain agents. It turns an intent into a simulated, policy-approved transaction plan and an auditable execution receipt.**

Customer promise to test:

> Launch one controlled DeFi workflow in under two weeks, without building the wallet, permission, simulation and observability stack from scratch.

This is not yet a proven promise. It becomes usable in sales only after two pilots meet it.

### Potential score

| Factor                  |      Today |     After 90-day gates |
| ----------------------- | ---------: | ---------------------: |
| Market timing           |       7/10 |                   7/10 |
| Technical assets        |       6/10 |                   7/10 |
| Current differentiation |       3/10 |                   6/10 |
| Security/readiness      |       2/10 |                   6/10 |
| Reachable distribution  |       5/10 |                   6/10 |
| Revenue evidence        |       1/10 |     6/10 if gates pass |
| **Overall**             | **4.0/10** | **6.3/10 conditional** |

**Investment decision:** spend 90 focused days to validate. Do not fund a broad marketplace build. Continue only if customers pay and the permission layer is demonstrably safe.

## 2. What PrismOS should and should not be

### Build and sell

- A B2B assisted product for teams shipping an onchain agent or automation workflow.
- Intent adapters for REST, SDK and eventually MCP/A2A.
- Transaction planning using proven routers such as LI.FI, Enso or native protocol adapters.
- Deterministic simulation and economic checks.
- Wallet-agnostic policy enforcement, starting with ZeroDev.
- Execution receipts, audit trails, alerts and incident tooling.
- One deep reference module: Uniswap V4 LP operations.

### Keep as components, not the message

- ZeroDev: first signer/session-key adapter.
- ENS: optional discovery/metadata layer.
- x402: optional billing and machine-discovery rail.
- Yellow: possible settlement adapter only if a customer needs it and production verification exists.
- Claude: planning assistant, never the authorization boundary.

### Do not build now

- A public two-sided marketplace.
- Retail yield acquisition.
- A token.
- A proprietary wallet or bundler.
- A proprietary bridge/swap router.
- A custom x402 variant.
- Multi-chain breadth before one production workflow is repeatable.
- Performance-fee or TVL-fee economics.
- “Guaranteed yield” or “agent can never withdraw” claims without enforcement.

## 3. Market facts

### Agentic payments are real but not yet a large revenue pool

- Chainalysis reported more than 100 million x402 transactions on Base through Q1 2026, while warning that early growth included speculative “pay-to-mint” activity.
- The x402 Foundation is now under Linux Foundation governance with 40 members.
- Google AP2 includes A2A-x402; Cloudflare supports x402 in Agents SDK/MCP; Coinbase provides production libraries and a facilitator.
- The official x402 ecosystem dashboard displayed 75.41 million transactions, $24.24 million volume, 94.06k buyers and 22k sellers over 30 days when inspected on 20 July 2026. Coverage and concentration make these directional metrics, not revenue forecasts.
- x402scan displayed a smaller tracked subset: 16.12 million transactions and $793k volume over 30 days, about $0.049 per transaction.

**Implication:** x402 validates machine payments but is open infrastructure. It is a channel and billing method, not PrismOS's moat.

### Smart-account infrastructure is mature and crowded

30-day npm downloads observed for 20 June–19 July 2026:

| Package                     | Downloads |
| --------------------------- | --------: |
| `@safe-global/protocol-kit` |   513,794 |
| `@lifi/sdk`                 |   395,520 |
| `@zerodev/sdk`              |   209,150 |
| `@coinbase/agentkit`        |    31,724 |

Privy, Turnkey, ZeroDev, Pimlico, Biconomy, MetaMask and Rhinestone already cover wallet creation, bundling, paymasters or session permissions.

**Implication:** session keys alone are not a product. The paid layer is safe DeFi execution, policy quality, simulation, observability and time-to-production.

### DeFi/LP activity is economically meaningful

DefiLlama data observed on 20 July 2026:

| Metric              |    Value |
| ------------------- | -------: |
| Base TVL            |  $4.58bn |
| Ethereum TVL        | $41.31bn |
| Arbitrum TVL        |  $1.23bn |
| Uniswap V4 TVL      |  $837.6m |
| Uniswap V3 TVL      |  $1.49bn |
| Arrakis Modular TVL |   $55.8m |

Uniswap V4 was approximately $635.7m on Ethereum and $77.6m combined on Base and Arbitrum in the detailed market review.

**Implication:** there is enough compatible capital for a B2B business. TVL is not PrismOS revenue and must not be called TAM.

## 4. Competitive map

| Category                  | Competitors                          | Threat       | PrismOS response                                     |
| ------------------------- | ------------------------------------ | ------------ | ---------------------------------------------------- |
| Intent/calldata           | Enso, LI.FI, 1inch                   | Very high    | Use them where useful; differentiate above routing   |
| Agent wallets/actions     | Coinbase AgentKit, Biconomy          | Very high    | Wallet-agnostic policies and receipts                |
| Key/wallet infrastructure | Privy, Turnkey, ZeroDev, Pimlico     | High         | Integrate, do not rebuild                            |
| DeFi autonomous agents    | Giza                                 | High         | Controlled execution and customer-specific workflows |
| LP management             | Arrakis, Gamma, Gauntlet/Aera, Yearn | Very high    | Do not sell performance until track record exists    |
| Agent payments            | x402/CDP, Cloudflare, AP2            | Commoditized | Official adapter only; never core moat               |

### Closest competitor

Enso already promises: “Turn DeFi product intent into signer-ready transaction data.” A generic calldata API is therefore not defensible.

### Defensible product hypothesis

PrismOS must own this sequence:

`intent → plan → simulation → policy decision → controlled signature → execution receipt → economic result`

Potential defensibility comes from:

- reusable policy templates for complex DeFi actions;
- wallet/signer portability;
- outcome data and failure intelligence;
- transaction-level observability;
- production integrations and customer trust;
- deep modules such as V4 LP execution.

## 5. Initial customer profile

### Primary ICP

Funded Web3 or agentic-app teams that:

- have 3–20 engineers;
- have a named CTO, Head of Engineering or Protocol Lead;
- need one DeFi workflow live within 3–6 months;
- require swap, liquidity, treasury or yield actions;
- do not have a dedicated wallet/session-key team;
- have a budget and can run a paid pilot;
- accept strict contract, asset and capital limits.

### Initial account universe

Do not claim millions of customers. Build a named list of **100–300 technically qualified organizations** from:

- AgentKit, x402, Base and ZeroDev ecosystems;
- hackathon and accelerator alumni;
- onchain apps adding agent capabilities;
- wallet and stablecoin apps with a DeFi roadmap;
- token teams experimenting with V4 liquidity.

### Exclude for now

- retail users;
- anonymous agents;
- DAOs without an accountable budget owner;
- large institutions or material TVL;
- clients asking PrismOS to custody assets or owner keys;
- clients requiring a guaranteed return;
- projects with no workflow, date or budget.

## 6. Paid problem and offer

The buyer does not pay for calldata. The buyer pays to reduce:

- months of wallet/session integration;
- risk of excessive agent authority;
- transaction failures and incident debugging;
- duplicated protocol integrations;
- time from prototype to a controlled production workflow.

### Offer 1 — Assisted pilot

**List price:** €5,000 excluding tax for six weeks.  
**First two design partners:** floor of €3,500 only in exchange for structured feedback, reference rights and reusable scope.  
**Payment:** 50% at signature, 50% at acceptance.

Includes:

- one chain;
- up to two reusable workflows;
- scoped policy manifest;
- staging/fork environment;
- simulation and execution receipt;
- deployment support;
- documented capital and contract limits.

Excludes gas, protocol fees, external API consumption, audit and custom contracts.

### Offer 2 — Launch

**€1,500/month**, minimum three months:

- one chain;
- 25,000 build/simulation requests;
- three active policies;
- log retention and alerts;
- four support hours/month;
- €0.03 per excess request.

### Offer 3 — Production

**€3,500/month** after operational readiness:

- up to three chains;
- 150,000 requests;
- isolated environments;
- ten support hours/month;
- target SLA 99.5% only after monitoring proves it;
- €0.015 per excess request.

### Enterprise

From €8,000/month, later only. Dedicated deployment, compliance and enhanced SLA are out of the first-year base forecast.

### Pricing rules

- Gas and third-party fees are paid directly by the client or passed through.
- No percentage of TVL or volume initially.
- No token incentives.
- Reprice if recurring gross margin falls below 65%.
- Do not offer free custom integrations; free discovery is limited to qualification.

## 7. Unit economics

Assume fully loaded technical time at €60/hour.

| Offer      |   Revenue | Variable cost |   Gross margin |
| ---------- | --------: | ------------: | -------------: |
| Pilot      |    €5,000 |        €2,125 | €2,875 / 57.5% |
| Launch     | €1,500/mo |       €400/mo | €1,100 / 73.3% |
| Production | €3,500/mo |       €950/mo | €2,550 / 72.9% |

Economic CAC assumption: €3,500 including founder time.

- Launch payback after conversion: 3.2 months.
- Production payback: 1.4 months.
- Break-even at €13k monthly fixed cost: about 12 Launch-equivalent customers or €18k MRR.

These are planning assumptions, not observed economics. Support time and retention must be measured from the first pilot.

## 8. Twelve-month scenarios

| Result            | Conservative |     Base |     High |
| ----------------- | -----------: | -------: | -------: |
| Paid pilots       |            3 |        8 |       15 |
| Converted clients |            2 |        5 |       10 |
| Total revenue     |      €31,500 | €100,500 | €198,000 |
| Gross profit      |      €20,725 |  €67,300 | €133,075 |
| Gross margin      |        65.8% |    67.0% |    67.2% |
| M12 MRR           |       €3,000 |   €9,500 |  €19,500 |
| Exit ARR          |      €36,000 | €114,000 | €234,000 |

With indicative OPEX of €96k / €156k / €240k, all three first-year scenarios remain loss-making. The base scenario produces an estimated **−€88.7k** pre-tax result.

### Financing implication

- Full-time execution with one progressive engineering hire needs roughly €100k–€150k runway.
- Bootstrap mode is possible by delaying hiring and using contractors only after payment.
- Do not hire full-time before three recurring clients, €6k MRR, or 12 months of funded runway.

## 9. Go-to-market

### Motion

Founder-led, account-based sales. No broad paid marketing.

1. Build a named account list.
2. Send a workflow-specific message.
3. Run a 30-minute technical discovery.
4. Produce a one-page risk/workflow map.
5. Sell the paid six-week pilot.
6. Convert only after a real workflow executes safely.

### Discovery questions

- Which onchain action must be live, on which chain, by what date?
- Who signs today and what can that signer do?
- What contracts, functions, assets and value limits are acceptable?
- What failed in the current implementation?
- How much engineering time is budgeted?
- What incident would make the project unacceptable?
- Who owns the budget and can approve a pilot?

### Outreach message

> We are validating PrismOS with teams shipping an onchain-agent workflow this quarter. We provide the transaction planning, simulation, scoped delegated permissions and execution receipts, starting with swaps and Uniswap V4 liquidity. The goal is one controlled workflow in under two weeks, without giving an agent unrestricted wallet access. Are you currently building a workflow where wallet permissions or DeFi integration is blocking production?

### Funnel targets for 12 months

| Scenario     | Accounts contacted | Discovery calls | Technical evaluations | Pilots | Conversions |
| ------------ | -----------------: | --------------: | --------------------: | -----: | ----------: |
| Conservative |                120 |              15 |                     5 |      3 |           2 |
| Base         |                240 |              35 |                    15 |      8 |           5 |
| High         |                400 |              60 |                    25 |     15 |          10 |

The high scenario requires a partner channel and must not be the operating budget.

## 10. Risks

### Security

- excessive session-key authority;
- delegated-secret compromise;
- prompt injection and malicious intents;
- stale simulation, slippage and MEV;
- replay, auth and revocation failures;
- smart-account dependency changes.

### Product

- calldata construction commoditized by Enso/LI.FI/1inch;
- every pilot becomes bespoke consulting;
- two unrelated offers dilute focus;
- marketplace launched before repeatable supply/demand.

### Commercial

- few agent teams have production budgets;
- Coinbase/Biconomy bundle similar capabilities;
- long wallet/fintech sales cycles;
- security objections stop pilots.

### Regulatory

Returning calldata and keeping owner keys with clients reduces custody risk but does not eliminate obligations. Strategy control, delegated execution, performance fees, asset type, AML/sanctions and jurisdiction need specific legal review. Do not claim regulatory neutrality.

### Brand

“PrismOS” is crowded across AI operating systems and hobby operating-system projects. An exact npm package was not found, but GitHub has many same-name projects, including another “local-first agentic personal AI OS” claiming patent pending. Before paid brand investment:

- perform trademark clearance in target jurisdictions/classes;
- check domains and social handles;
- decide whether PrismOS remains a product codename or commercial mark.

## 11. Go / pivot / no-go

### Day 30

**Go:** 15 buyer interviews; 8 have a dated workflow; 5 name permission/integration risk; 3 technical scoping sessions; one signed pilot with at least €2,500 deposit.

**No-go:** after 30 targeted contacts and 15 interviews, no deposit, no dated/budgeted workflow or universal preference to build internally.

### Day 60

**Go:** two paid pilots; at least €8k contracted; one controlled testnet/mainnet workflow; integration ≤10 working days; ≥99% valid plans simulable; zero out-of-policy test execution.

**Pivot:** clients pay only for bespoke work or >40% of delivery is not reusable.

**No-go:** critical permission incident, delivery cost above price or no second pilot.

### Day 90

**Go:** three paid pilots; two recurring conversions/commitments; ≥€3k contracted MRR; ≥65% forecast recurring gross margin; five additional qualified opportunities; zero open critical vulnerability.

**Conditional go:** two pilots, one conversion and three budgeted qualified opportunities.

**Stop/reposition:** <€10k total contracted, no subscription, >30% recurring revenue consumed by support, unique architecture per customer, or inability to prove reliable restrictions.

## 12. Sources

- x402 Foundation dashboard: https://www.x402.org/
- Coinbase x402 overview: https://docs.cdp.coinbase.com/x402/welcome
- Coinbase x402 flow: https://docs.cdp.coinbase.com/x402/core-concepts/how-it-works
- Cloudflare x402 Foundation announcement: https://blog.cloudflare.com/x402/
- Chainalysis adoption analysis, 3 June 2026: https://www.chainalysis.com/blog/x402-agentic-payments-adoption/
- Linux Foundation, 14 July 2026: https://www.linuxfoundation.org/press/linux-foundation-announces-operational-launch-of-x402-foundation-to-standardize-internet-native-payments-for-ai-agents-and-applications
- Google AP2: https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol
- Coinbase AgentKit: https://docs.cdp.coinbase.com/agent-kit/welcome
- Enso: https://docs.enso.build/home
- LI.FI: https://li.fi/
- Biconomy agents: https://www.biconomy.io/agents
- ZeroDev session keys: https://docs.zerodev.app/smart-accounts/permissions/session-keys
- Turnkey agents: https://www.turnkey.com/solutions/ai-agents
- MetaMask advanced permissions: https://docs.metamask.io/smart-accounts-kit/1.2.0/concepts/advanced-permissions/
- Arrakis: https://arrakis.finance/
- Gamma: https://docs.gamma.xyz/
- DefiLlama APIs: https://api.llama.fi/v2/chains and https://api.llama.fi/protocols
- npm download API: https://api.npmjs.org/downloads/

Market metrics are dated observations, not guaranteed complete coverage. Company metrics are treated as self-reported where applicable.
