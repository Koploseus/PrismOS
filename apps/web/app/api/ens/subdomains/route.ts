import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_ENS_CHAIN_ID, DOMAIN_BY_NAME_QUERY } from "@/lib/ens";

const SUBGRAPH_ID = "5XqPmWe6gjyrJtFn9cLy237i4cWw2j9HcUJEXsP5qGtH";

function getSubgraphUrl(chainId: number): string | null {
  const apiKey = process.env.THEGRAPH_API_KEY;
  if (chainId === 1) {
    return apiKey
      ? `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${SUBGRAPH_ID}`
      : `https://gateway.thegraph.com/api/subgraphs/id/${SUBGRAPH_ID}`;
  }
  if (chainId === 11155111) {
    return "https://api.studio.thegraph.com/query/49574/enssepolia/version/latest";
  }
  return null;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const domain = searchParams.get("domain");
  const chainId = parseInt(searchParams.get("chainId") || DEFAULT_ENS_CHAIN_ID.toString());

  if (!domain) {
    return NextResponse.json({ error: "Domain parameter is required" }, { status: 400 });
  }

  const url = getSubgraphUrl(chainId);
  if (!url) {
    return NextResponse.json({ error: `Unsupported chain: ${chainId}` }, { status: 400 });
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: DOMAIN_BY_NAME_QUERY,
        variables: { name: domain.toLowerCase() },
      }),
    });

    if (!response.ok) {
      throw new Error(`Subgraph request failed: ${response.status}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(data.errors[0]?.message || "GraphQL error");
    }

    return NextResponse.json(data.data);
  } catch (error) {
    console.error("ENS subgraph error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch subdomains" },
      { status: 500 }
    );
  }
}
