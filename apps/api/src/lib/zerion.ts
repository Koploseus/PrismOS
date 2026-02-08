/**
 * Zerion API client for wallet portfolio, positions, and transactions.
 *
 * Free tier: 10 req/s, 2,000 req/day.
 * Auth: HTTP Basic with API key as username, no password.
 *
 * Docs: https://developers.zerion.io
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function getApiKey(): string {
  return process.env.ZERION_API_KEY || "";
}

function authHeaders(): Record<string, string> {
  const key = getApiKey();
  if (!key) return {};
  // HTTP Basic: base64(key + ":")
  const encoded = Buffer.from(`${key}:`).toString("base64");
  return { Authorization: `Basic ${encoded}` };
}

function isConfigured(): boolean {
  return !!getApiKey();
}

// ---------------------------------------------------------------------------
// Generic fetch helper
// ---------------------------------------------------------------------------

async function zerionFetch<T>(path: string, timeout = 15000): Promise<T | null> {
  if (!isConfigured()) {
    console.warn("[zerion] No ZERION_API_KEY configured");
    return null;
  }

  const url = `https://api.zerion.io${path}`;
  try {
    const res = await fetch(url, {
      headers: {
        ...authHeaders(),
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(timeout),
    });

    if (res.status === 202) {
      // Portfolio not ready yet — Zerion is indexing
      console.log("[zerion] 202: data not ready yet, will retry");
      return null;
    }

    if (!res.ok) {
      console.warn(`[zerion] HTTP ${res.status}: ${res.statusText} for ${path}`);
      return null;
    }

    return (await res.json()) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[zerion] Fetch failed for ${path}: ${msg}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Types — Portfolio
// ---------------------------------------------------------------------------

export interface ZerionPortfolio {
  links: { self: string };
  data: {
    type: "portfolio";
    id: string;
    attributes: {
      positions_distribution_by_type: {
        wallet: number;
        deposited: number;
        borrowed: number;
        locked: number;
        staked: number;
      };
      positions_distribution_by_chain: Record<string, number>;
      total: { positions: number };
      changes: { absolute_1d: number; percent_1d: number };
    };
  };
}

// ---------------------------------------------------------------------------
// Types — Positions
// ---------------------------------------------------------------------------

export interface ZerionQuantity {
  int: string;
  decimals: number;
  float: number;
  numeric: string;
}

export interface ZerionFungibleInfo {
  name: string;
  symbol: string;
  icon?: { url: string | null };
  flags?: { verified: boolean };
  implementations?: Array<{
    chain_id: string;
    address?: string;
    decimals: number;
  }>;
}

export interface ZerionPosition {
  type: "positions";
  id: string;
  attributes: {
    parent: string | null;
    protocol: string | null;
    protocol_module?: string;
    name: string;
    group_id?: string;
    position_type: "deposit" | "loan" | "locked" | "staked" | "reward" | "wallet" | "investment" | null;
    quantity: ZerionQuantity;
    value: number | null;
    price: number;
    changes?: { absolute_1d: number; percent_1d: number };
    fungible_info: ZerionFungibleInfo;
    flags?: { displayable: boolean; is_trash?: boolean };
    updated_at?: string;
    application_metadata?: {
      name?: string;
      icon?: { url: string | null };
      url?: string;
    };
  };
  relationships: {
    chain: { data: { type: string; id: string } };
    fungible: { data: { type: string; id: string } };
  };
}

export interface ZerionPositionsResponse {
  links: { self: string; next?: string };
  data: ZerionPosition[];
}

// ---------------------------------------------------------------------------
// Types — Transactions
// ---------------------------------------------------------------------------

export interface ZerionTransfer {
  fungible_info?: ZerionFungibleInfo;
  nft_info?: { name: string };
  direction: "in" | "out" | "self";
  quantity: ZerionQuantity;
  value: number | null;
  price: number | null;
  sender: string;
  recipient: string;
}

export interface ZerionTransaction {
  type: "transactions";
  id: string;
  attributes: {
    operation_type: string;
    hash: string;
    mined_at_block: number;
    mined_at: string;
    sent_from: string;
    sent_to: string;
    status: "confirmed" | "failed" | "pending";
    nonce: number;
    fee: {
      fungible_info: ZerionFungibleInfo;
      quantity: ZerionQuantity;
      price: number | null;
      value: number | null;
    };
    transfers: ZerionTransfer[];
    approvals: unknown[];
    application_metadata?: {
      name?: string;
      icon?: { url: string | null };
      contract_address?: string;
      method?: { id: string; name: string };
    };
    flags?: { is_trash: boolean };
  };
  relationships: {
    chain: { data: { type: string; id: string } };
    dapp?: { data: { type: string; id: string } };
  };
}

export interface ZerionTransactionsResponse {
  links: { self: string; next?: string };
  data: ZerionTransaction[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get portfolio overview for a wallet.
 * Use `filter[positions]=no_filter` to include both wallet + DeFi positions.
 */
export async function getPortfolio(
  address: string,
  options?: { includeDefi?: boolean }
): Promise<ZerionPortfolio | null> {
  const filter = options?.includeDefi ? "no_filter" : "only_simple";
  return zerionFetch<ZerionPortfolio>(
    `/v1/wallets/${address}/portfolio?currency=usd&filter[positions]=${filter}`
  );
}

/**
 * Get all fungible positions for a wallet.
 *
 * - `only_simple` = wallet tokens only (default)
 * - `only_complex` = DeFi protocol positions only (Uniswap, Aave, etc.)
 * - `no_filter` = everything
 *
 * LP positions in the same pool share a `group_id`.
 */
export async function getPositions(
  address: string,
  options?: {
    filter?: "only_simple" | "only_complex" | "no_filter";
    chainId?: string; // "ethereum", "arbitrum", etc.
  }
): Promise<ZerionPositionsResponse | null> {
  const filter = options?.filter || "no_filter";
  let path = `/v1/wallets/${address}/positions/?currency=usd&filter[positions]=${filter}&sort=-value`;
  if (options?.chainId) {
    path += `&filter[chain_ids]=${options.chainId}`;
  }
  return zerionFetch<ZerionPositionsResponse>(path);
}

/**
 * Get transaction history for a wallet.
 */
export async function getTransactions(
  address: string,
  options?: {
    chainId?: string;
    pageSize?: number;
  }
): Promise<ZerionTransactionsResponse | null> {
  const size = options?.pageSize || 20;
  let path = `/v1/wallets/${address}/transactions/?currency=usd&page[size]=${size}`;
  if (options?.chainId) {
    path += `&filter[chain_ids]=${options.chainId}`;
  }
  return zerionFetch<ZerionTransactionsResponse>(path);
}

// ---------------------------------------------------------------------------
// Helpers for extracting LP info
// ---------------------------------------------------------------------------

/**
 * Zerion chain_id mapping (Zerion uses slug names, not numeric IDs).
 */
export const CHAIN_ID_TO_ZERION: Record<number, string> = {
  1: "ethereum",
  42161: "arbitrum",
  8453: "base",
  10: "optimism",
  137: "polygon",
  43114: "avalanche",
  56: "binance-smart-chain",
  324: "zksync-era",
  59144: "linea",
  534352: "scroll",
};

export interface LPGroupSummary {
  groupId: string;
  protocol: string | null;
  protocolName: string | null;
  positions: Array<{
    symbol: string;
    amount: number;
    valueUsd: number;
    priceUsd: number;
  }>;
  totalValueUsd: number;
}

/**
 * Group DeFi positions by group_id to reconstruct LP pairs.
 * Each LP pool has 2+ positions sharing the same group_id.
 */
export function groupLPPositions(positions: ZerionPosition[]): LPGroupSummary[] {
  const groups = new Map<string, ZerionPosition[]>();

  for (const pos of positions) {
    const groupId = pos.attributes.group_id;
    if (!groupId) continue;
    // Only DeFi positions (deposits)
    if (pos.attributes.position_type !== "deposit") continue;

    const existing = groups.get(groupId) || [];
    existing.push(pos);
    groups.set(groupId, existing);
  }

  const summaries: LPGroupSummary[] = [];

  for (const [groupId, groupPositions] of groups) {
    const protocol = groupPositions[0]?.attributes.protocol || null;
    const protocolName = groupPositions[0]?.attributes.application_metadata?.name || null;

    const posData = groupPositions.map((p) => ({
      symbol: p.attributes.fungible_info.symbol,
      amount: p.attributes.quantity.float,
      valueUsd: p.attributes.value ?? 0,
      priceUsd: p.attributes.price,
    }));

    summaries.push({
      groupId,
      protocol,
      protocolName,
      positions: posData,
      totalValueUsd: posData.reduce((sum, p) => sum + p.valueUsd, 0),
    });
  }

  return summaries;
}

/**
 * Extract wallet (non-protocol) positions.
 */
export function getWalletPositions(
  positions: ZerionPosition[]
): Array<{ symbol: string; amount: number; valueUsd: number; priceUsd: number; address?: string }> {
  return positions
    .filter((p) => p.attributes.position_type === "wallet")
    .map((p) => {
      const impl = p.attributes.fungible_info.implementations?.find(
        (i) => i.chain_id === "ethereum"
      );
      return {
        symbol: p.attributes.fungible_info.symbol,
        amount: p.attributes.quantity.float,
        valueUsd: p.attributes.value ?? 0,
        priceUsd: p.attributes.price,
        address: impl?.address,
      };
    });
}

export { isConfigured };
