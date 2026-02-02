'use client';

import { useConnection } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';


export default function DashboardPage() {
  const { isConnected, address } = useConnection();

  if (!isConnected) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center" data-testid="dashboard-connect">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Connect Your Wallet</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <p className="text-muted-foreground text-center">
              Connect your wallet to view your subscribed agents and analytics.
            </p>
            <ConnectButton />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen" data-testid="dashboard-page">
      <section>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="font-mono text-3xl md:text-4xl font-bold tracking-tight">Dashboard</h1>
              <p className="mt-1 text-muted-foreground font-mono text-sm">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </p>
            </div>
            <Badge variant="outline" className="font-mono text-xs self-start">
              0 Active Subscriptions
            </Badge>
          </div>
        </div>
      </section>
    </div>
  );
}
