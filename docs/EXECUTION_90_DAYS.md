# PrismOS — 90-Day Operating Plan

**Objective:** determine with paid evidence whether PrismOS can become a repeatable B2B product.  
**Non-objective:** maximize features, GitHub stars, wallets, API calls or hackathon visibility.

## Operating rules

1. No meaningful real money while a delegated key has sudo authority.
2. No feature without a named customer workflow or a release gate.
3. No marketplace work during this period.
4. No token, TVL fee, performance promise or broad retail launch.
5. AI proposes; deterministic policy and simulation authorize.
6. A pilot must pay at least 50% before custom delivery begins.
7. Weekly decisions use contracted revenue, qualified opportunities, delivery time and security gates.

## Product target at day 90

A client can submit an intent and receive:

```text
intent
  → normalized transaction plan
  → simulation result
  → deterministic policy decision
  → delegated execution
  → transaction and economic receipt
```

Initial supported scope:

- one production chain selected from actual pilot demand;
- ZeroDev adapter;
- swap;
- Uniswap V4 add/increase/collect/decrease liquidity;
- explicit allowlists, value limits and expiry;
- signed enrollment and revocation;
- auditable receipts.

## Roles

### Hermes / operating lead

- maintain market/account research;
- prepare discovery briefs and proposals;
- maintain product truth, risk register and weekly scorecard;
- draft product requirements and review code/tests;
- track funnel, delivery cost and milestones;
- prevent unvalidated roadmap expansion.

### Founder/user

- approve positioning and commercial terms;
- make founder-to-founder outreach where identity and trust are required;
- attend qualified discovery calls;
- approve transactions, infrastructure spend and legal/security engagements;
- own final customer and deployment decisions.

## Days 1–14 — safety and reproducibility

### Engineering

- [ ] Replace ZeroDev `SudoPolicy` with scoped `CallPolicy`.
- [ ] Define policy manifest: chain, targets, selectors, assets, values, expiry and rate/spend limits.
- [ ] Add negative tests for transfer, approval, arbitrary target, excessive value and expired policy.
- [ ] Add signed nonce/challenge to subscribe and revoke APIs.
- [ ] Encrypt delegated credentials; define key rotation and revocation drill.
- [ ] Add simulation before every delegated execution.
- [ ] Add intent/plan/policy/simulation/execution receipt IDs.
- [ ] Keep CI build, tests, lint and format green.
- [ ] Remove misleading security claims from UI until enforcement is deployed.

### Commercial

- [ ] Build first 60-account named list.
- [ ] Segment each account by workflow, chain, stack, buyer and trigger date.
- [ ] Send 30 personalized messages.
- [ ] Book first five discovery calls.
- [ ] Prepare pilot one-pager and €5k statement of work.

### Exit criteria

- policy test matrix green;
- no sudo path used by demo;
- one controlled fork E2E;
- five discovery calls booked;
- at least one technical scoping candidate.

## Days 15–30 — problem and offer validation

### Engineering

- [ ] Complete one end-to-end controlled workflow on fork/testnet.
- [ ] Measure plan latency, simulation success, execution success and receipt completeness.
- [ ] Package a minimal TypeScript client.
- [ ] Document a 30-minute quickstart for the selected workflow.
- [ ] Replace proprietary `X-Payment` copy with honest “billing adapter experimental” status; do not make x402 a release dependency.

### Customer work

- [ ] Complete 15 buyer interviews.
- [ ] Record exact workflow, deadline, current stack, risk, budget and decision owner.
- [ ] Run three technical scoping workshops.
- [ ] Send at least two paid pilot proposals.
- [ ] Sign one pilot with ≥€2,500 deposit.

### Day-30 decision

**Go** only if a real buyer pays or the threshold is narrowly missed with an identified procurement date. Otherwise pivot the workflow or stop broad development.

## Days 31–45 — first pilot

### Delivery

- [ ] Freeze pilot policy and contract/asset allowlist.
- [ ] Define capital cap and emergency stop.
- [ ] Integrate the first customer workflow in staging.
- [ ] Run failure injection: bad quote, stale simulation, RPC timeout, nonce conflict, revoked key, excessive value.
- [ ] Produce incident and rollback runbook.
- [ ] Measure founder and engineering hours.

### Productization

- [ ] Extract only components reusable for a second customer.
- [ ] Maintain adapter boundaries for planner, simulator, signer and logger.
- [ ] Do not merge customer-specific logic into the policy core.

## Days 46–60 — second pilot and delivery proof

- [ ] Close a second paid pilot.
- [ ] Reach ≥€8k cumulative contracted value.
- [ ] Deliver first controlled workflow in ≤10 working days excluding client delays.
- [ ] Achieve ≥99% simulable valid plans in the pilot test corpus.
- [ ] Demonstrate zero out-of-policy execution in negative tests.
- [ ] Keep support below 8 hours/week/pilot.
- [ ] Confirm variable delivery cost ≤55% of pilot price.

### Day-60 decision

- **Go:** repeatable delivery and second payment.
- **Solutions-engineering pivot:** clients pay but require hands-on delivery; price accordingly and stop calling it SaaS.
- **No-go:** permission incident, no second buyer or delivery economics below zero.

## Days 61–75 — recurring offer

- [ ] Convert first successful pilot to Launch at €1,500/month.
- [ ] Add monitoring, alerts, retention and usage metering required by that client.
- [ ] Integrate official x402 v2 only if it reduces billing friction or creates a channel.
- [ ] Publish one anonymized technical case study with measurable time/risk reduction.
- [ ] Start partner outreach to ZeroDev, LI.FI/Enso, Base and agent frameworks.
- [ ] Build next 60-account tranche from the validated workflow.

## Days 76–90 — repeatability decision

- [ ] Three paid pilots cumulative.
- [ ] Two recurring conversions or signed recurring commitments.
- [ ] ≥€3k contracted MRR.
- [ ] Five additional qualified opportunities.
- [ ] Second integration completed without policy-core rewrite.
- [ ] Median activation ≤10 working days.
- [ ] Forecast gross margin ≥65%.
- [ ] Zero open critical vulnerability.

## Weekly scorecard

Update every Friday:

| Metric                          |  Target day 30 |  Target day 60 | Target day 90 |
| ------------------------------- | -------------: | -------------: | ------------: |
| Named accounts researched       |             60 |            120 |           180 |
| Buyer interviews cumulative     |             15 |             25 |            35 |
| Technical evaluations           |              3 |              6 |            10 |
| Paid pilots                     |              1 |              2 |             3 |
| Contracted revenue              | ≥€2.5k deposit |           ≥€8k |         ≥€10k |
| Contracted MRR                  |             €0 | ≥€1.5k desired |          ≥€3k |
| Median integration time         |       Baseline |       ≤10 days |      ≤10 days |
| Valid plans simulable           |       Baseline |           ≥99% |          ≥99% |
| Out-of-policy executions        |              0 |              0 |             0 |
| Critical vulnerabilities open   | 0 before money |              0 |             0 |
| Recurring gross margin forecast |        Unknown |           ≥65% |          ≥65% |

## Pilot acceptance criteria

A pilot is accepted only when:

1. agreed intent generates the expected plan;
2. plan simulates successfully under defined state assumptions;
3. every plan is checked against a versioned policy;
4. unauthorized variations are rejected;
5. execution produces a verifiable onchain receipt;
6. the economic result and fees are recorded;
7. revocation stops future execution;
8. no owner key is held by PrismOS;
9. delegated credential handling matches the security design;
10. runbook and support boundary are delivered.

## Backlog after validation, not before

- second smart-account adapter;
- MCP/A2A distribution;
- official x402 billing/discovery;
- additional chains;
- LP issuer-specific analytics;
- public agent registry;
- marketplace/reputation layer.

A marketplace becomes eligible only after at least 10 external agents/integrations, recurring buyer demand and a credible verification/reputation mechanism.
