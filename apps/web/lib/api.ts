const API_BASE_URL =
  typeof window !== "undefined"
    ? process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:3001"
    : process.env.AGENT_API_URL || process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:3001";

export interface TokenBalance {
  raw: string;
  formatted: string;
  usd: string;
}

export interface PositionData {
  address: string;
  balances: {
    wbtc: TokenBalance;
    cbbtc: TokenBalance;
    usdc: TokenBalance;
    eth?: TokenBalance;
    wsteth?: TokenBalance;
    [key: string]: TokenBalance | undefined;
  };
  position: {
    totalValueUSD: string;
    wbtcRatio: string;
    cbbtcRatio: string;
    ratioDeviation: string;
    inRange: boolean;
    needsRebalance: boolean;
  };
  fees: {
    estimatedUSD: string;
    claimable: boolean;
  };
  market: {
    btcPriceUSD: string;
    timestamp: number;
  };
  recommendations: string[];
  receipt?: PaymentReceipt;
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

export interface SubscribeRequest {
  userAddress: string;
  smartAccount: string;
  sessionKeyAddress: string;
  sessionPrivateKey: string;
  serializedSessionKey: string;
  agentEns: string;
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
  private defaultHeaders: HeadersInit;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
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
    const headers: HeadersInit = {};
    if (paymentHeader) {
      headers["X-Payment"] = paymentHeader;
    }

    const encodedAgent = encodeURIComponent(agentEns);
    return this.get<SubscribersResponse>(`/api/subscribers?agent=${encodedAgent}`, headers);
  }

  async getPosition(address: string, paymentHeader?: string): Promise<ApiResponse<PositionData>> {
    const headers: HeadersInit = {};
    if (paymentHeader) {
      headers["X-Payment"] = paymentHeader;
    }

    return this.get<PositionData>(`/api/position/${address}`, headers);
  }

  async subscribe(
    data: SubscribeRequest,
    paymentHeader?: string
  ): Promise<ApiResponse<SubscribeResponse>> {
    const headers: HeadersInit = {};
    if (paymentHeader) {
      headers["X-Payment"] = paymentHeader;
    }

    return this.post<SubscribeResponse>("/api/subscribe", data, headers);
  }

  async buildCalldata(
    action: string,
    params: Record<string, unknown>,
    paymentHeader?: string
  ): Promise<ApiResponse<BuildCalldataResponse>> {
    const headers: HeadersInit = {};
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

  parsePaymentHeader(header: string): Record<string, unknown> | null {
    try {
      const decoded = Buffer.from(header, "base64").toString("utf-8");
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`, {
        method: "GET",
        headers: this.defaultHeaders,
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, "");
  }

  setDefaultHeader(key: string, value: string): void {
    this.defaultHeaders = {
      ...this.defaultHeaders,
      [key]: value,
    };
  }

  removeDefaultHeader(key: string): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [key]: _, ...rest } = this.defaultHeaders as Record<string, string>;
    this.defaultHeaders = rest;
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
