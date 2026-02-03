import { Address, Hex, keccak256, encodePacked } from "viem";

export const YELLOW_ENDPOINTS = {
  PRODUCTION: "wss://clearnet.yellow.com/ws",
  SANDBOX: "wss://clearnet-sandbox.yellow.com/ws",
} as const;

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const PRISMOS_ADDRESS = (process.env.PRISMOS_PAYMENT_ADDRESS ||
  "0xF4874485E3e8844b04577A646EdB0a9E6a5E0c68") as Address;

export const ENDPOINT_PRICING: Record<string, number> = {
  "/api/subscribers": 0.001,
  "/api/subscribe": 0.001,
  "/api/position": 0.005,
  "/api/build": 0.01,
  "/api/build/settle": 0.01,
};

interface ChannelState {
  channelId: Hex;
  nonce: bigint;
  agentBalance: bigint;
  prismosBalance: bigint;
  lastUpdate: number;
  signature?: Hex;
}

export interface PaymentProof {
  channelId: Hex;
  amount: bigint;
  nonce: bigint;
  newAgentBalance: bigint;
  signature: Hex;
  agentAddress: Address;
}

const channelStore = new Map<string, ChannelState>();

export function parsePaymentHeader(header: string): PaymentProof | null {
  try {
    if (!header.startsWith("x402:")) return null;
    const parts = header.slice(5).split(":");
    if (parts.length !== 6) return null;
    const [channelId, amount, nonce, newBalance, signature, agentAddress] = parts;
    return {
      channelId: channelId as Hex,
      amount: BigInt(amount),
      nonce: BigInt(nonce),
      newAgentBalance: BigInt(newBalance),
      signature: signature as Hex,
      agentAddress: agentAddress as Address,
    };
  } catch {
    return null;
  }
}

export function computePaymentHash(
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

export async function verifyPayment(
  proof: PaymentProof,
  requiredAmount: bigint
): Promise<{ valid: boolean; error?: string }> {
  try {
    if (proof.amount < requiredAmount) {
      return { valid: false, error: `Insufficient payment: ${proof.amount} < ${requiredAmount}` };
    }

    const channelKey = `${proof.agentAddress}:${proof.channelId}`;
    let channel = channelStore.get(channelKey);

    if (!channel) {
      channel = {
        channelId: proof.channelId,
        nonce: 0n,
        agentBalance: 10_000_000n, // 10 USDC initial credit (demo)
        prismosBalance: 0n,
        lastUpdate: Date.now(),
      };
    }

    if (proof.nonce <= channel.nonce) {
      return { valid: false, error: `Invalid nonce: ${proof.nonce} <= ${channel.nonce}` };
    }

    if (channel.agentBalance < proof.amount) {
      return { valid: false, error: `Insufficient channel balance: ${channel.agentBalance}` };
    }

    const expectedNewAgentBalance = channel.agentBalance - proof.amount;
    if (proof.newAgentBalance !== expectedNewAgentBalance) {
      return {
        valid: false,
        error: `Balance mismatch: ${proof.newAgentBalance} !== ${expectedNewAgentBalance}`,
      };
    }

    // Demo: accept any properly formatted signature
    if (proof.signature.length < 10) {
      return { valid: false, error: "Invalid signature" };
    }

    channel.nonce = proof.nonce;
    channel.agentBalance = proof.newAgentBalance;
    channel.prismosBalance = channel.prismosBalance + proof.amount;
    channel.lastUpdate = Date.now();
    channel.signature = proof.signature;
    channelStore.set(channelKey, channel);

    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

export function getChannelState(agentAddress: Address, channelId: Hex): ChannelState | null {
  return channelStore.get(`${agentAddress}:${channelId}`) || null;
}

export function getAllChannels(): Map<string, ChannelState> {
  return channelStore;
}

export function createChannel(
  agentAddress: Address,
  initialDeposit: bigint
): { channelId: Hex; state: ChannelState } {
  const channelId = keccak256(
    encodePacked(["address", "uint256"], [agentAddress, BigInt(Date.now())])
  ) as Hex;
  const state: ChannelState = {
    channelId,
    nonce: 0n,
    agentBalance: initialDeposit,
    prismosBalance: 0n,
    lastUpdate: Date.now(),
  };
  channelStore.set(`${agentAddress}:${channelId}`, state);
  return { channelId, state };
}

export function formatPaymentRequired(endpoint: string): {
  price: number;
  token: Address;
  recipient: Address;
  endpoint: string;
} {
  return {
    price: ENDPOINT_PRICING[endpoint] || 0.01,
    token: USDC_BASE,
    recipient: PRISMOS_ADDRESS,
    endpoint,
  };
}
