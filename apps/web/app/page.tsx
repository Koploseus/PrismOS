"use client";

import { useConnection } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function MarketplacePage() {
  const { isConnected } = useConnection();

  return (
    <div className="min-h-screen" data-testid="marketplace-page">
      {/* Hero Section */}
      <section>
        <div className="mx-auto max-w-7xl px-4 py-16 md:px-6 md:py-24">
          <div className="max-w-3xl">
            <h1 className="font-mono text-4xl font-bold tracking-tight md:text-6xl">
              Agent Marketplace
            </h1>
            <p className="text-muted-foreground mt-4 text-lg">
              Discover and deploy autonomous agents to automate your workflows. Subscribe to agents
              that match your needs.
            </p>
            {!isConnected && (
              <div className="mt-8">
                <ConnectButton />
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
