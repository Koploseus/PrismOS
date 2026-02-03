import { Context, Next } from "hono";
import {
  parsePaymentHeader,
  verifyPayment,
  formatPaymentRequired,
  ENDPOINT_PRICING,
} from "../lib/yellow";
import { Address, Hex, keccak256, encodePacked } from "viem";

const isDevMode = process.env.SKIP_PAYMENT === "true" || process.env.NODE_ENV === "development";

function generatePaymentId(): string {
  return `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function x402Middleware(c: Context, next: Next) {
  const path = c.req.path;
  const price = ENDPOINT_PRICING[path];

  if (!price) {
    await next();
    return;
  }

  if (isDevMode) {
    c.set("paymentId", `dev_${generatePaymentId()}`);
    c.set("paymentAmount", price);
    c.set("paymentBypassed", true);
    await next();
    return;
  }

  const paymentHeader = c.req.header("X-Payment");

  if (!paymentHeader) {
    return c.json(
      {
        error: "Payment Required",
        code: 402,
        payment: formatPaymentRequired(path),
        message: "Include X-Payment header with valid state channel payment",
      },
      402
    );
  }

  const proof = parsePaymentHeader(paymentHeader);

  if (!proof) {
    return c.json(
      {
        error: "Invalid Payment Format",
        code: 400,
        expected: "x402:<channelId>:<amount>:<nonce>:<newBalance>:<signature>:<agentAddress>",
      },
      400
    );
  }

  const requiredAmount = BigInt(Math.floor(price * 1_000_000));
  const verification = await verifyPayment(proof, requiredAmount);

  if (!verification.valid) {
    return c.json(
      {
        error: "Payment Verification Failed",
        code: 402,
        reason: verification.error,
        payment: formatPaymentRequired(path),
      },
      402
    );
  }

  c.set("paymentId", generatePaymentId());
  c.set("paymentAmount", price);
  c.set("paymentProof", proof);
  c.set("agentAddress", proof.agentAddress);

  await next();
}

export function generateReceipt(
  paymentId: string | undefined,
  endpoint: string,
  amount: number,
  actions?: string[]
) {
  return {
    id: paymentId || `receipt_${Date.now()}`,
    timestamp: new Date().toISOString(),
    endpoint,
    amount: amount.toFixed(6),
    currency: "USDC",
    status: "paid",
    actions,
  };
}

export function createPaymentHeader(
  channelId: Hex,
  amount: bigint,
  nonce: bigint,
  newAgentBalance: bigint,
  signature: Hex,
  agentAddress: Address
): string {
  return `x402:${channelId}:${amount}:${nonce}:${newAgentBalance}:${signature}:${agentAddress}`;
}

export function computePaymentMessage(
  channelId: Hex,
  nonce: bigint,
  agentBalance: bigint,
  prismosBalance: bigint
): Hex {
  return keccak256(
    encodePacked(
      ["bytes32", "uint256", "uint256", "uint256"],
      [channelId, nonce, agentBalance, prismosBalance]
    )
  );
}
