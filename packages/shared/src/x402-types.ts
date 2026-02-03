/**
 * x402 Protocol Types
 * Based on https://www.x402.org
 */

import type { Address, Hex } from "viem";

/**
 * x402 Payment Required response
 */
export interface X402PaymentRequired {
  /** Price in smallest unit of currency */
  price: string;
  /** Currency (e.g., "USDC") */
  currency: string;
  /** Human-readable description */
  description: string;
  /** Payment network/settlement layer */
  network: string;
  /** Settlement method */
  settlement: "onchain" | "yellow-state-channel";
  /** Recipient address */
  recipient: Address;
  /** Optional: Yellow state channel ID */
  channelId?: string;
  /** Expiration timestamp */
  expiresAt: number;
}

/**
 * x402 Payment header for Yellow settlement
 */
export interface X402YellowPayment {
  /** Yellow state channel ID */
  channelId: string;
  /** Signed state update */
  stateUpdate: Hex;
  /** Sender address */
  sender: Address;
  /** Amount paid */
  amount: string;
  /** Currency */
  currency: string;
}

/**
 * x402 Payment verification result
 */
export interface X402PaymentVerification {
  valid: boolean;
  error?: string;
  /** Amount verified */
  amount?: string;
  /** Sender address */
  sender?: Address;
}

/**
 * Facilitator interface for x402 payments
 */
export interface X402Facilitator {
  /** Verify a payment */
  verify(payment: X402YellowPayment): Promise<X402PaymentVerification>;
  /** Get current balance of a channel */
  getChannelBalance(channelId: string): Promise<string>;
  /** Settle channel on-chain */
  settle(channelId: string): Promise<Hex>;
}
