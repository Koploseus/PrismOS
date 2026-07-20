# PrismOS — Product Truth

**Audit date:** 20 July 2026  
**Audited revision:** `bed3cde` (`origin/main`)  
**Purpose:** distinguish what is implemented and verified from the hackathon pitch.

## Executive status

PrismOS is an **advanced experimental prototype**, not a production DeFi platform.

The strongest demonstrated asset is an end-to-end reference workflow that combines a Next.js app, a Hono calldata API, a ZeroDev smart account, a delegated session key, LI.FI routing, Uniswap V4 LP operations, Zerion portfolio data and an autonomous agent loop. The project documentation reports a successful Ethereum mainnet test using 2 USDC.

The project must not accept meaningful user funds until the security blockers below are closed.

## What is implemented

### Frontend

- Wallet connection and ZeroDev Kernel smart-account creation.
- Agent catalog and subscription flow.
- Session-key generation and transfer to the agent service.
- Dashboard and position display using Zerion with RPC fallback.
- Revocation flow initiated by the wallet owner.

### API

- Hono HTTP API with health, strategy, subscription, position, transaction and calldata-building endpoints.
- Stateless transaction construction for swaps and Uniswap V4 LP operations.
- LI.FI quote/calldata integration.
- TypeScript build succeeds.

### Agent runtime

- Local subscription store.
- ZeroDev delegated execution using UserOperations.
- Deposit watcher and hourly management loop.
- Rule-based decision engine plus optional Anthropic structured-tool decisions.
- Live market-data calls.
- Uniswap V4 tick, liquidity and swap calculations.
- TypeScript build succeeds.

### Verification performed

- API TypeScript build: pass.
- Agent TypeScript build: pass.
- Lint: pass.
- Prettier check: pass.
- Agent high-level assertions: 10/10 pass.
- V4 math assertions: 40/40 pass when the script is executed directly.
- Frontend production build initially failed on a `ChainId` typing defect; corrected on the strategy branch.
- Root test command initially failed because the shared package invoked Vitest without tests; corrected on the strategy branch.

## What is not production ready

### 1. Session key is currently sudo

`apps/web/lib/zerodev.ts` calls `toSudoPolicy({})`. The generated delegated key therefore has broad authority. The UI and README state that transfers, burns and withdrawals are blocked, but the code does not currently enforce those restrictions.

**Consequence:** the promises “scoped”, “limited”, “safe by design” and “the agent can never withdraw funds” are not valid in the current revision.

**Release blocker:** replace sudo with a tested CallPolicy that binds:

- allowed chain IDs;
- target contracts;
- function selectors;
- allowed assets;
- value limits;
- per-transaction and rolling spend limits;
- expiry;
- optional rate limits;
- explicit denial of arbitrary calls, upgrades, transfers and approvals.

### 2. Delegated secret custody

The browser generates a session private key and sends it to the agent service. The agent stores it in plaintext JSON on local disk.

This is not custody of the user's owner key, but it is custody of an active delegated credential. A server compromise can use every permission granted to that key.

**Release blocker:** authenticated enrollment, encrypted secret storage or KMS/HSM-backed signer, secret rotation, revocation drill, least-privilege policy and incident procedure.

### 3. API authorization is insufficient

Subscription and revocation requests validate address formats or equality but do not prove ownership through a signed challenge. CORS is open globally.

**Release blocker:** wallet-signed nonce/challenge, replay protection, origin policy, rate limiting and authenticated agent-to-control-plane traffic.

### 4. x402 claim is not standards-compliant

The current middleware uses a proprietary `X-Payment` format. The current x402 flow uses standard `PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE` and `PAYMENT-RESPONSE` headers with a facilitator or local verification.

The current flow is bypassed in development and Yellow settlement is not a verified production rail.

**Decision:** remove custom Yellow settlement from the critical path. Integrate the official x402 SDK/facilitator only after the core execution product is secure. Treat x402 as billing/discovery, not as the product.

### 5. AI output is not a security boundary

Claude or the rule engine can choose actions. A typed response is not proof that an action is economically safe. Prompt injection, corrupted market data or bad reasoning can still propose harmful calldata.

**Release blocker:** deterministic validation and simulation after AI planning and before signing. AI may recommend; policy code must authorize.

### 6. Economic validation is incomplete

- One documented 2 USDC mainnet E2E is valuable evidence, but not a performance history.
- No verified benchmark for net LP performance, impermanent loss, fee capture or drawdown.
- No production SLA, incident runbook or security audit.
- No active paying customer evidence.

## Claims matrix

| Claim                                      | Current evidence                             | Status            |
| ------------------------------------------ | -------------------------------------------- | ----------------- |
| API returns signer-ready DeFi transactions | TypeScript implementation and build          | Demonstrated      |
| End-to-end LP creation                     | Documented 2 USDC mainnet test               | Demonstrated once |
| 40 V4 math assertions                      | Direct script execution: 40/40               | Demonstrated      |
| Autonomous management loop                 | Implemented; 10 high-level assertions        | Prototype         |
| Non-custodial owner model                  | Owner key stays with user                    | Partly true       |
| Scoped agent permissions                   | Current policy is sudo                       | False today       |
| Agent can never withdraw                   | Not enforced by current policy               | False today       |
| Production x402 over Yellow                | Proprietary header/dev bypass                | Not demonstrated  |
| Multi-agent marketplace                    | Catalog architecture, no supply/demand proof | Concept only      |
| Strategy performance                       | No track record or benchmark                 | Not demonstrated  |

## Maturity score

| Dimension             | Score / 10 | Reason                                                 |
| --------------------- | ---------: | ------------------------------------------------------ |
| Technical prototype   |          6 | Real integrations and one E2E flow                     |
| Build/test discipline |          5 | Core TS builds; CI previously skipped build/test       |
| Security readiness    |          2 | Sudo delegation and plaintext delegated secrets        |
| Product coherence     |          4 | Marketplace, LP manager and API are mixed              |
| Commercial readiness  |          2 | No validated buyer or paying customer                  |
| Production operations |          1 | No SLA, monitoring evidence, audit or incident process |

## Immediate release gates

A real-money pilot requires all of the following:

1. No `SudoPolicy` in a user-facing path.
2. A policy test matrix proving unauthorized transfers, approvals and targets fail.
3. Signed enrollment and revocation requests.
4. Encrypted delegated credentials and a successful revocation drill.
5. Transaction simulation plus policy evaluation for every execution.
6. Complete intent → plan → simulation → policy → signature → receipt audit log.
7. Defined capital cap and allowlisted assets/contracts for the pilot.
8. Security review of the delegated execution path.
9. Production build and tests green in CI.
10. Honest UI copy that matches the deployed policy.
