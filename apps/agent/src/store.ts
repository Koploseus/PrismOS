/**
 * Agent-local subscription store.
 *
 * THIS is where session keys live. Never on the API side.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type { Address } from "viem";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const DATA_FILE = path.join(DATA_DIR, "agent-subscriptions.json");

export interface AgentSubscription {
  smartAccount: Address;
  userAddress: Address;
  sessionKeyAddress: Address;
  serializedSessionKey: string;
  sessionPrivateKey: string; // ONLY stored here on the agent, never sent to API
  agentEns: string;
  permissionId: string | null;
  compoundPercent: number;
  distributePercent: number;
  distributionAddress: Address;
  distributionMode: "compound" | "distribute" | "mixed";
  positionTokenId: string | null;
  status: "active" | "paused" | "error" | "revoked";
  lastActionAt: number | null;
  subscribedAt: number;
}

interface StoreData {
  subscriptions: Record<string, AgentSubscription>;
  lastUpdated: number;
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readStore(): StoreData {
  try {
    if (!fs.existsSync(DATA_FILE)) return { subscriptions: {}, lastUpdated: Date.now() };
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return { subscriptions: {}, lastUpdated: Date.now() };
  }
}

function writeStore(data: StoreData): void {
  ensureDir();
  data.lastUpdated = Date.now();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

export function loadSubscriptions(): AgentSubscription[] {
  return Object.values(readStore().subscriptions);
}

export function getSubscription(smartAccount: string): AgentSubscription | null {
  return readStore().subscriptions[smartAccount.toLowerCase()] ?? null;
}

export function upsertSubscription(
  smartAccount: string,
  update: Partial<AgentSubscription>
): AgentSubscription {
  const data = readStore();
  const key = smartAccount.toLowerCase();
  const existing = data.subscriptions[key];

  const sub: AgentSubscription = {
    smartAccount: (update.smartAccount ?? existing?.smartAccount ?? smartAccount) as Address,
    userAddress: (update.userAddress ?? existing?.userAddress ?? "") as Address,
    sessionKeyAddress: (update.sessionKeyAddress ?? existing?.sessionKeyAddress ?? "") as Address,
    serializedSessionKey: update.serializedSessionKey ?? existing?.serializedSessionKey ?? "",
    sessionPrivateKey: update.sessionPrivateKey ?? existing?.sessionPrivateKey ?? "",
    agentEns: update.agentEns ?? existing?.agentEns ?? "",
    permissionId: update.permissionId ?? existing?.permissionId ?? null,
    compoundPercent: update.compoundPercent ?? existing?.compoundPercent ?? 70,
    distributePercent: update.distributePercent ?? existing?.distributePercent ?? 30,
    distributionAddress: (update.distributionAddress ??
      existing?.distributionAddress ??
      "") as Address,
    distributionMode: update.distributionMode ?? existing?.distributionMode ?? "mixed",
    positionTokenId: update.positionTokenId ?? existing?.positionTokenId ?? null,
    status: update.status ?? existing?.status ?? "active",
    lastActionAt: update.lastActionAt ?? existing?.lastActionAt ?? null,
    subscribedAt: existing?.subscribedAt ?? Date.now(),
  };

  data.subscriptions[key] = sub;
  writeStore(data);
  return sub;
}

export function updateSubscription(smartAccount: string, update: Partial<AgentSubscription>): void {
  upsertSubscription(smartAccount, update);
}

export function removeSubscription(smartAccount: string): void {
  const data = readStore();
  delete data.subscriptions[smartAccount.toLowerCase()];
  writeStore(data);
}
