'use client';

import { useConnection } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';


export default function MarketplacePage() {
  const { isConnected } = useConnection();

  return (
    <div className="min-h-screen" data-testid="marketplace-page">
      {/* Hero Section */}
      <section>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-16 md:py-24">
          <div className="max-w-3xl">
            <h1 className="font-mono text-4xl md:text-6xl font-bold tracking-tight">
              Agent Marketplace
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Discover and deploy autonomous agents to automate your workflows.
              Subscribe to agents that match your needs.
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
