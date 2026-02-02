"use client";

import { useConnection } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DashboardPage() {
  const { isConnected, address } = useConnection();

  if (!isConnected) {
    return (
      <div
        className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center"
        data-testid="dashboard-connect"
      >
        <Card className="mx-4 w-full max-w-md">
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
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="font-mono text-3xl font-bold tracking-tight md:text-4xl">Dashboard</h1>
              <p className="text-muted-foreground mt-1 font-mono text-sm">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </p>
            </div>
            <Badge variant="outline" className="self-start font-mono text-xs">
              0 Active Subscriptions
            </Badge>
          </div>
        </div>
      </section>
    </div>
  );
}
