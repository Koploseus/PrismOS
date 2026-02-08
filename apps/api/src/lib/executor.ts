/**
 * Session key executor stub.
 *
 * Session-key execution has moved to apps/agent.
 * API remains a stateless calldata service.
 */

import type { Call } from "./calldataBuilder";
import type { Subscription } from "./subscriptions";

export interface ExecutionResult {
  success: boolean;
  txHash?: string;
  userOpHash?: string;
  error?: string;
}

export async function executeViaSessionKey(
  subscription: Subscription,
  calls: Call[]
): Promise<ExecutionResult> {
  void subscription;
  void calls;
  return {
    success: false,
    error: "Session-key execution moved to apps/agent",
  };
}
