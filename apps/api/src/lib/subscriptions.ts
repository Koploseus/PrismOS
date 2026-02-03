/**
 * Subscriptions data layer.
 * JSON file for now, ENS later.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { Address } from "viem";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, "../../../../data/subscriptions.json");

export interface Subscription {
  userAddress: Address;
  smartAccount: Address;
  sessionKeyAddress: Address | null;
  sessionPrivateKey: string | null;
  serializedSessionKey: string | null;
  agentEns: string;
  subscribedAt: number;
  distributionAddress: Address;
  distributionMode: "compound" | "distribute" | "mixed";
  compoundPercent: number;
  distributePercent: number;
  destinationChain?: number;
  positionTokenId?: string | null;
  positionTxHash?: string | null;
  status: "active" | "paused" | "pending_deposit" | "creating_position" | "error";
  lastActionAt?: number | null;
  totalFeesCollected: string;
  totalFeesCompounded: string;
  totalDistributed: string;
}

interface Data {
  subscriptions: Record<string, Subscription>;
  lastUpdated: number;
}

function ensureDir() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function readSubscriptions(): Data {
  try {
    if (!fs.existsSync(DATA_FILE)) return { subscriptions: {}, lastUpdated: Date.now() };
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return { subscriptions: {}, lastUpdated: Date.now() };
  }
}

export function writeSubscriptions(data: Data): void {
  ensureDir();
  data.lastUpdated = Date.now();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function getSubscriptionBySmartAccount(addr: Address): Subscription | null {
  return readSubscriptions().subscriptions[addr.toLowerCase()] ?? null;
}

export function getSubscriptionsByAgent(ens: string): Subscription[] {
  return Object.values(readSubscriptions().subscriptions).filter(
    (s) => s.agentEns.toLowerCase() === ens.toLowerCase()
  );
}

export function upsertSubscription(addr: Address, update: Partial<Subscription>): Subscription {
  const data = readSubscriptions();
  const key = addr.toLowerCase();
  const existing = data.subscriptions[key];

  const sub: Subscription = {
    userAddress: update.userAddress ?? existing?.userAddress ?? ("" as Address),
    smartAccount: addr,
    sessionKeyAddress: update.sessionKeyAddress ?? existing?.sessionKeyAddress ?? null,
    sessionPrivateKey: update.sessionPrivateKey ?? existing?.sessionPrivateKey ?? null,
    serializedSessionKey: update.serializedSessionKey ?? existing?.serializedSessionKey ?? null,
    agentEns: update.agentEns ?? existing?.agentEns ?? "",
    subscribedAt: existing?.subscribedAt ?? Date.now(),
    distributionAddress:
      update.distributionAddress ?? existing?.distributionAddress ?? ("" as Address),
    distributionMode: update.distributionMode ?? existing?.distributionMode ?? "mixed",
    compoundPercent: update.compoundPercent ?? existing?.compoundPercent ?? 70,
    distributePercent: update.distributePercent ?? existing?.distributePercent ?? 30,
    destinationChain: update.destinationChain ?? existing?.destinationChain,
    positionTokenId: update.positionTokenId ?? existing?.positionTokenId ?? null,
    positionTxHash: update.positionTxHash ?? existing?.positionTxHash ?? null,
    status: update.status ?? existing?.status ?? "active",
    lastActionAt: update.lastActionAt ?? existing?.lastActionAt ?? null,
    totalFeesCollected: update.totalFeesCollected ?? existing?.totalFeesCollected ?? "0",
    totalFeesCompounded: update.totalFeesCompounded ?? existing?.totalFeesCompounded ?? "0",
    totalDistributed: update.totalDistributed ?? existing?.totalDistributed ?? "0",
  };

  data.subscriptions[key] = sub;
  writeSubscriptions(data);
  return sub;
}

export function toSubscriberView(s: Subscription) {
  return {
    smartAccount: s.smartAccount,
    userAddress: s.userAddress,
    sessionKeyAddress: s.sessionKeyAddress,
    sessionPrivateKey: s.sessionPrivateKey,
    serializedSessionKey: s.serializedSessionKey,
    agentEns: s.agentEns,
    config: {
      compound: s.compoundPercent,
      distribute: s.distributePercent,
      destination: s.distributionAddress || null,
      destChain: s.destinationChain || null,
    },
    positionTokenId: s.positionTokenId,
    positionTxHash: s.positionTxHash,
    subscribedAt: s.subscribedAt,
    lastActionAt: s.lastActionAt,
    status: s.status,
  };
}
