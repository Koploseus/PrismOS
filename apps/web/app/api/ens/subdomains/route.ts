import { NextRequest, NextResponse } from "next/server";
import { ENS_SUBGRAPH_URLS, DEFAULT_ENS_CHAIN_ID, DOMAIN_BY_NAME_QUERY } from "@/lib/ens";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const domain = searchParams.get("domain");
  const chainId = parseInt(searchParams.get("chainId") || DEFAULT_ENS_CHAIN_ID.toString());

  if (!domain) {
    return NextResponse.json({ error: "Domain parameter is required" }, { status: 400 });
  }

  const url = ENS_SUBGRAPH_URLS[chainId];
  if (!url) {
    return NextResponse.json({ error: `Unsupported chain: ${chainId}` }, { status: 400 });
  }

  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    // Only add auth header if API key is available
    if (process.env.THEGRAPH_API_KEY) {
      headers["Authorization"] = `Bearer ${process.env.THEGRAPH_API_KEY}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
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
