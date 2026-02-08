const API_BASE_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:3002"
    : process.env.AGENT_API_URL || process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:3002";

/** Agent subscribe endpoint — session keys go HERE, not to the API */
const AGENT_SUBSCRIBE_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_AGENT_SUBSCRIBE_URL || "http://localhost:3003"
    : process.env.AGENT_SUBSCRIBE_URL ||
      process.env.NEXT_PUBLIC_AGENT_SUBSCRIBE_URL ||
      "http://localhost:3003";

export interface TokenBalance {
  raw: string;
  formatted: string;
  usd: string;
}

/**
 * Position response from GET /api/position/:address?agent=...
 * This matches the actual API handler response shape.
 */
export interface PositionData {
  success: boolean;
  address: string;
  chainId: number;
  hasPosition: boolean;
  walletValueUsd: number;
  token0Balance: string;
  token1Balance: string;
  token0Address: string;
  token1Address: string;
  token0Decimals: number;
  token1Decimals: number;
  token0Symbol: string;
  token1Symbol: string;
  positionCount: number;
  token0PriceUsd?: number;
  token1PriceUsd?: number;
  /** @deprecated */
  btcPrice?: number;

  strategy?: {
    chainId: number;
    protocol: string;
    pool: string;
    token0: { address: string; symbol: string; decimals: number };
    token1: { address: string; symbol: string; decimals: number };
  };
  wallet?: {
    token0: TokenBalance;
    token1: TokenBalance;
    totalValueUsd: string;
  };
  lpPositions?: {
    count: number;
    positionManager: string;
    tokenIds: string[];
    pool: string;
    protocol: string;
    valueUsd?: number;
    inRange?: boolean;
    tickLower?: number;
    tickUpper?: number;
    token0Amount?: number;
    token1Amount?: number;
  };
  summary?: {
    walletValueUsd: string;
    positionCount: number;
    token0Ratio: string;
    hasActivePosition: boolean;
    inRange?: boolean;
  };
  market?: {
    token0PriceUsd?: string;
    token1PriceUsd?: string;
    btcPrice?: string;
    timestamp: number;
  };
  recommendations?: string[];
  dataSource?: "zerion" | "rpc";
}

export interface TransactionTransfer {
  direction: "in" | "out" | "self";
  symbol: string;
  amount: number;
  valueUsd: number | null;
}

export interface TransactionNftTransfer {
  direction: "in" | "out" | "self";
  name: string;
  tokenId?: string;
}

export interface TransactionSummary {
  id: string;
  hash: string;
  type: string;
  status: "confirmed" | "failed" | "pending";
  timestamp: string;
  chain: string;
  fee: { valueUsd: number | null; symbol: string };
  transfers: TransactionTransfer[];
  nftTransfers: TransactionNftTransfer[];
  protocol?: string;
}

export interface TransactionsResponse {
  success: boolean;
  address: string;
  transactions: TransactionSummary[];
  count: number;
  timestamp: number;
}

export interface SubscriberConfig {
  compound: number;
  distribute: number;
  destination: string | null;
  destChain: number | null;
}

export interface Subscriber {
  ens: string | null;
  ensResolved?: string;
  smartAccount: string;
  config: SubscriberConfig;
  subscribedAt: number;
  status: "active" | "paused" | "cancelled";
}

export interface SubscribersResponse {
  agent: string;
  subscriberCount: number;
  subscribers: Subscriber[];
  timestamp: number;
  cached?: boolean;
  receipt?: PaymentReceipt;
}

export interface UserSubscription {
  smartAccount: string;
  agentEns: string;
  status:
    | "active"
    | "paused"
    | "pending_deposit"
    | "creating_position"
    | "error"
    | "revoked"
    | "processing";
  subscribedAt: number;
  positionTokenId: string | null;
  totalFeesCollected: string;
  totalFeesCompounded: string;
  totalDistributed: string;
  compoundPercent: number;
  distributePercent: number;
}

export interface UserSubscriptionsResponse {
  success: boolean;
  userAddress: string;
  subscriptions: UserSubscription[];
}

export interface SubscribeRequest {
  userAddress: string;
  smartAccount: string;
  sessionKeyAddress: string;
  sessionPrivateKey: string;
  serializedSessionKey: string;
  agentEns: string;
  permissionId?: string;
  config: {
    compound: number;
    destination: string;
    destChain: string;
  };
}

export interface SubscribeResponse {
  success: boolean;
  subscriptionId?: string;
  error?: string;
}

export interface RevokeResponse {
  success: boolean;
  smartAccount: string;
  status: string;
}

export interface BuildCalldataRequest {
  action: string;
  params: Record<string, unknown>;
}

export interface BuildCalldataResponse {
  calldata: string;
  to?: string;
  value?: string;
  gasLimit?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentReceipt {
  txHash?: string;
  amount?: string;
  currency?: string;
  timestamp?: number;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
}

export type ApiResponse<T> = { success: true; data: T } | { success: false; error: ApiError };

export class ApiClient {
  private baseUrl: string;
  private agentUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(baseUrl: string = API_BASE_URL, agentUrl: string = AGENT_SUBSCRIBE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.agentUrl = agentUrl.replace(/\/$/, "");
    this.defaultHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.defaultHeaders,
          ...options.headers,
        },
        signal: AbortSignal.timeout(15000),
      });

      let body: unknown;
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        body = await response.json();
      } else {
        body = await response.text();
      }

      if (!response.ok) {
        const error: ApiError = {
          message:
            typeof body === "object" && body !== null && "message" in body
              ? String((body as Record<string, unknown>).message)
              : `HTTP ${response.status}: ${response.statusText}`,
          status: response.status,
          code:
            typeof body === "object" && body !== null && "code" in body
              ? String((body as Record<string, unknown>).code)
              : undefined,
          details:
            typeof body === "object" && body !== null
              ? (body as Record<string, unknown>)
              : undefined,
        };
        return { success: false, error };
      }

      return { success: true, data: body as T };
    } catch (err) {
      const error: ApiError = {
        message: err instanceof Error ? err.message : "Unknown error occurred",
        code: "NETWORK_ERROR",
      };
      return { success: false, error };
    }
  }

  private get<T>(endpoint: string, headers?: HeadersInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "GET", headers });
  }

  private post<T>(endpoint: string, body: unknown, headers?: HeadersInit): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
      headers,
    });
  }

  async getSubscribers(
    agentEns: string,
    paymentHeader?: string
  ): Promise<ApiResponse<SubscribersResponse>> {
    const headers: Record<string, string> = {};
    if (paymentHeader) {
      headers["X-Payment"] = paymentHeader;
    }

    const encodedAgent = encodeURIComponent(agentEns);
    return this.get<SubscribersResponse>(`/api/subscribers?agent=${encodedAgent}`, headers);
  }

  /**
   * Get user subscriptions.
   * Queries both API and agent, merges by smartAccount (agent wins on conflict).
   */
  async getUserSubscriptions(userAddress: string): Promise<ApiResponse<UserSubscriptionsResponse>> {
    // Query both in parallel
    const [apiResult, agentSubs] = await Promise.all([
      this.get<UserSubscriptionsResponse>(`/api/subscriptions/${userAddress}`),
      this.fetchAgentSubscriptions(userAddress),
    ]);

    // Merge: agent-side is authoritative, keyed by smartAccount
    const map = new Map<string, UserSubscription>();

    // API subs first (will be overwritten by agent)
    if (isSuccess(apiResult)) {
      for (const s of apiResult.data.subscriptions) {
        map.set(s.smartAccount.toLowerCase(), s);
      }
    }

    // Agent subs overwrite
    for (const s of agentSubs) {
      map.set(s.smartAccount.toLowerCase(), s);
    }

    const merged = Array.from(map.values());

    return {
      success: true,
      data: { success: true, userAddress, subscriptions: merged },
    };
  }

  /** Fetch subscriptions from the agent service (port 3003). */
  private async fetchAgentSubscriptions(userAddress: string): Promise<UserSubscription[]> {
    try {
      const res = await fetch(`${this.agentUrl}/subscriptions/${userAddress}`, {
        headers: this.defaultHeaders,
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.subscriptions)) {
          return data.subscriptions as UserSubscription[];
        }
      }
    } catch {
      // Agent unreachable
    }
    return [];
  }

  /**
   * Get position data for a smart account.
   * Now passes the agentEns query param (required by the position handler).
   */
  async getPosition(
    address: string,
    agentEns?: string,
    paymentHeader?: string
  ): Promise<ApiResponse<PositionData>> {
    const headers: Record<string, string> = {};
    if (paymentHeader) {
      headers["X-Payment"] = paymentHeader;
    }

    const agentParam = agentEns ? `?agent=${encodeURIComponent(agentEns)}` : "";
    return this.get<PositionData>(`/api/position/${address}${agentParam}`, headers);
  }

  async getTransactions(
    address: string,
    chain?: string,
    limit?: number
  ): Promise<ApiResponse<TransactionsResponse>> {
    const params = new URLSearchParams();
    if (chain) params.set("chain", chain);
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();
    return this.get<TransactionsResponse>(`/api/transactions/${address}${qs ? `?${qs}` : ""}`);
  }

  /**
   * Subscribe to an agent.
   * Sends session keys to the AGENT service (port 3003), NOT the API.
   * Session private keys must only live on the agent side.
   */
  async subscribe(
    data: SubscribeRequest,
    paymentHeader?: string
  ): Promise<ApiResponse<SubscribeResponse>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (paymentHeader) {
      headers["X-Payment"] = paymentHeader;
    }

    // Send to AGENT subscribe endpoint, not the API
    try {
      const response = await fetch(`${this.agentUrl}/subscribe`, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
      });

      let body: unknown;
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        body = await response.json();
      } else {
        body = await response.text();
      }

      if (!response.ok) {
        return {
          success: false,
          error: {
            message:
              typeof body === "object" && body !== null && "error" in body
                ? String((body as Record<string, unknown>).error)
                : `HTTP ${response.status}`,
            status: response.status,
          },
        };
      }

      return { success: true, data: body as SubscribeResponse };
    } catch (err) {
      return {
        success: false,
        error: {
          message: err instanceof Error ? err.message : "Failed to connect to agent",
          code: "AGENT_NETWORK_ERROR",
        },
      };
    }
  }

  async revokeSubscription(data: {
    smartAccount: string;
    userAddress: string;
  }): Promise<ApiResponse<RevokeResponse>> {
    return this.post<RevokeResponse>("/api/revoke", data);
  }

  async buildCalldata(
    action: string,
    params: Record<string, unknown>,
    paymentHeader?: string
  ): Promise<ApiResponse<BuildCalldataResponse>> {
    const headers: Record<string, string> = {};
    if (paymentHeader) {
      headers["X-Payment"] = paymentHeader;
    }

    const body: BuildCalldataRequest = { action, params };
    return this.post<BuildCalldataResponse>("/api/build", body, headers);
  }

  createPaymentHeader(paymentData: {
    signature?: string;
    amount?: string;
    token?: string;
    metadata?: Record<string, unknown>;
  }): string {
    const payload = {
      version: "1",
      ...paymentData,
      timestamp: Date.now(),
    };
    return Buffer.from(JSON.stringify(payload)).toString("base64");
  }

  async healthCheck(options?: { signal?: AbortSignal }): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, {
        method: "GET",
        headers: this.defaultHeaders,
        signal: options?.signal,
      });
      return response.ok;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return false;
      }
      return false;
    }
  }
}

export const api = new ApiClient();

export function isSuccess<T>(response: ApiResponse<T>): response is { success: true; data: T } {
  return response.success === true;
}

export function isError<T>(
  response: ApiResponse<T>
): response is { success: false; error: ApiError } {
  return response.success === false;
}

export function getErrorMessage<T>(response: ApiResponse<T>): string | null {
  if (isError(response)) {
    return response.error.message;
  }
  return null;
}

export function unwrap<T>(response: ApiResponse<T>): T {
  if (isSuccess(response)) {
    return response.data;
  }
  throw new Error(response.error.message);
}

export function unwrapOr<T>(response: ApiResponse<T>, defaultValue: T): T {
  if (isSuccess(response)) {
    return response.data;
  }
  return defaultValue;
}
