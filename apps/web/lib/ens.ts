/**
 * ENS Text Record Keys for PrismOS Agents
 *
 * These keys map to the ENS text records schema defined in the protocol.
 */

export const ENS_TEXT_KEYS = {
  // Identity
  name: "prismos.agent.name",
  description: "prismos.agent.description",
  wallet: "prismos.agent.wallet",
  avatar: "avatar",
  version: "prismos.agent.version",

  // Strategy
  strategyId: "prismos.strategy.id",
  strategyPool: "prismos.strategy.pool",
  strategyChain: "prismos.strategy.chain",
  strategyRisk: "prismos.strategy.risk",
  strategyProtocol: "prismos.strategy.protocol",
  strategyPair: "prismos.strategy.pair",
  strategyDescription: "prismos.strategy.description",

  // Fees (basis points for %, microunits for flat)
  feeCollect: "prismos.fee.collect",
  feeRebalance: "prismos.fee.rebalance",
  feeCompound: "prismos.fee.compound",
  feeRangeAdjust: "prismos.fee.rangeAdjust",

  // Permissions
  permissions: "prismos.permissions",
  contracts: "prismos.contracts",
} as const;

export type ENSTextKey = (typeof ENS_TEXT_KEYS)[keyof typeof ENS_TEXT_KEYS];

/**
 * All text record keys as an array for batch fetching
 */
export const ALL_ENS_TEXT_KEYS = Object.values(ENS_TEXT_KEYS);

/**
 * Required fields for a valid agent registration
 */
export const REQUIRED_ENS_FIELDS = [
  ENS_TEXT_KEYS.name,
  ENS_TEXT_KEYS.wallet,
  ENS_TEXT_KEYS.strategyPool,
  ENS_TEXT_KEYS.strategyChain,
  ENS_TEXT_KEYS.strategyPair,
  ENS_TEXT_KEYS.permissions,
] as const;

/**
 * ENS Subgraph URLs by network
 */
export const ENS_SUBGRAPH_URLS: Record<number, string> = {
  1: "https://gateway.thegraph.com/api/subgraphs/id/5XqPmWe6gjyrJtFn9cLy237i4cWw2j9HcUJEXsP5qGtH",
  11155111: "https://api.studio.thegraph.com/query/49574/enssepolia/version/latest",
};

/**
 * Default chain for ENS resolution
 */
export const DEFAULT_ENS_CHAIN_ID = 1;

/**
 * GraphQL query to fetch subdomains of a domain
 */
export const SUBDOMAINS_QUERY = `
  query GetSubdomains($domainId: ID!) {
    domain(id: $domainId) {
      id
      name
      labelName
      owner {
        id
      }
      subdomains(first: 100, orderBy: createdAt, orderDirection: desc) {
        id
        name
        labelName
        owner {
          id
        }
        resolver {
          id
          address
          texts
        }
        createdAt
        expiryDate
      }
    }
  }
`;

/**
 * GraphQL query to fetch domains owned by an address
 */
export const DOMAINS_BY_OWNER_QUERY = `
  query GetDomainsByOwner($owner: String!) {
    domains(
      first: 50
      where: { owner: $owner }
      orderBy: createdAt
      orderDirection: desc
    ) {
      id
      name
      labelName
      owner {
        id
      }
      subdomainCount
      resolver {
        id
        address
      }
    }
  }
`;

/**
 * GraphQL query to search for a domain by name
 */
export const DOMAIN_BY_NAME_QUERY = `
  query GetDomainByName($name: String!) {
    domains(where: { name: $name }) {
      id
      name
      labelName
      owner {
        id
      }
      subdomainCount
      subdomains(first: 100, orderBy: createdAt, orderDirection: desc) {
        id
        name
        labelName
        owner {
          id
        }
        resolver {
          id
          address
          texts
        }
        createdAt
      }
      resolver {
        id
        address
        texts
      }
    }
  }
`;

/**
 * Types for subgraph responses
 */
export interface SubgraphOwner {
  id: string;
}

export interface SubgraphResolver {
  id: string;
  address: string;
  texts?: string[];
}

export interface SubgraphSubdomain {
  id: string;
  name: string;
  labelName: string;
  owner: SubgraphOwner | null;
  resolver: SubgraphResolver | null;
  createdAt: string;
  expiryDate?: string;
}

export interface SubgraphDomain {
  id: string;
  name: string;
  labelName: string;
  owner: SubgraphOwner | null;
  subdomainCount?: number;
  subdomains?: SubgraphSubdomain[];
  resolver: SubgraphResolver | null;
}

export interface SubdomainsQueryResult {
  domain: SubgraphDomain | null;
}

export interface DomainsByOwnerQueryResult {
  domains: SubgraphDomain[];
}

export interface DomainByNameQueryResult {
  domains: SubgraphDomain[];
}

/**
 * Compute the namehash for a domain (used as ID in the subgraph)
 * This is a simplified version - in production use viem's namehash
 */
export function computeNamehash(name: string): string {
  // The subgraph uses the namehash as the domain ID
  // For lookup by name, we use the DOMAIN_BY_NAME_QUERY instead
  return name.toLowerCase();
}
