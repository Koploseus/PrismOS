"use client";

import { useState } from "react";
import { useConnection } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Bot,
  TrendingUp,
  Zap,
  DollarSign,
  ChevronRight,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  PiggyBank,
  RefreshCw,
  Target,
  ExternalLink,
  Loader2,
  AlertCircle,
  ShieldOff,
  Check,
} from "lucide-react";
import { Address, Hex } from "viem";
import { CHAIN_NAMES, SubscribedAgent } from "@/lib/types";
import { useDashboard, useSmartAccount } from "@/hooks";
import { api } from "@/lib/api";
import { RevokeModal } from "@/components/revoke-modal";
import { toast } from "sonner";

export default function DashboardPage() {
  const { address, isConnected } = useConnection();
  const [selectedSubscription, setSelectedSubscription] = useState<SubscribedAgent | null>(null);

  const {
    subscriptions: displaySubscriptions,
    isLoading: subscriptionsLoading,
    error: apiError,
    refresh,
  } = useDashboard(address);

  const totalPositionValue = displaySubscriptions.reduce((sum, s) => sum + s.position.valueUsd, 0);
  const totalNetYield = displaySubscriptions.reduce((sum, s) => sum + s.stats.netYield, 0);
  const totalFeesPaid = displaySubscriptions.reduce((sum, s) => sum + s.stats.feesPaidToAgent, 0);
  const avgApy =
    displaySubscriptions.length > 0
      ? displaySubscriptions.reduce((sum, s) => sum + s.stats.realizedApy, 0) /
        displaySubscriptions.length
      : 0;
  const totalUnclaimedFees = displaySubscriptions.reduce(
    (sum, s) => sum + s.position.unclaimedFees,
    0
  );

  const activeBotCount = displaySubscriptions.length;

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
              Connect your wallet to view your subscribed agents and LP positions.
            </p>
            <ConnectButton />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen" data-testid="dashboard-page">
      {apiError && (
        <div
          className="bg-destructive/10 border-destructive/20 border-b px-4 py-3"
          data-testid="api-error-banner"
        >
          <div className="mx-auto flex max-w-7xl items-center gap-2">
            <AlertCircle className="text-destructive h-4 w-4 shrink-0" />
            <p className="text-destructive font-mono text-sm">{apiError}</p>
          </div>
        </div>
      )}

      <section className="border-b">
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="font-mono text-3xl font-bold tracking-tight md:text-4xl">Dashboard</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Manage your LP positions and track agent performance
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                {activeBotCount} Active Subscriptions
              </Badge>
            </div>
          </div>
        </div>
      </section>

      {/* Portfolio Overview */}
      <section className="bg-muted/30 border-b">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <div className="bg-background border p-4">
              <div className="text-muted-foreground mb-2 flex items-center gap-2">
                <Wallet className="h-4 w-4" strokeWidth={1.5} />
                <span className="font-mono text-[10px] uppercase">Total Position</span>
              </div>
              <p className="font-mono text-2xl font-bold">
                ${totalPositionValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="bg-background border p-4">
              <div className="text-muted-foreground mb-2 flex items-center gap-2">
                <TrendingUp className="text-success h-4 w-4" strokeWidth={1.5} />
                <span className="font-mono text-[10px] uppercase">Net Yield</span>
              </div>
              <p className="text-success font-mono text-2xl font-bold">
                +${totalNetYield.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-background border p-4">
              <div className="text-muted-foreground mb-2 flex items-center gap-2">
                <Zap className="h-4 w-4" strokeWidth={1.5} />
                <span className="font-mono text-[10px] uppercase">Avg APY</span>
              </div>
              <p className="font-mono text-2xl font-bold">{avgApy.toFixed(1)}%</p>
            </div>
            <div className="bg-background border p-4">
              <div className="text-muted-foreground mb-2 flex items-center gap-2">
                <Bot className="h-4 w-4" strokeWidth={1.5} />
                <span className="font-mono text-[10px] uppercase">Agent Fees</span>
              </div>
              <p className="text-muted-foreground font-mono text-2xl font-bold">
                ${totalFeesPaid.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-background border p-4">
              <div className="text-muted-foreground mb-2 flex items-center gap-2">
                <PiggyBank className="h-4 w-4" strokeWidth={1.5} />
                <span className="font-mono text-[10px] uppercase">Unclaimed</span>
              </div>
              <p className="text-warning font-mono text-2xl font-bold">
                ${totalUnclaimedFees.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-4">
              <h2 className="text-muted-foreground font-mono text-xs uppercase">Your Positions</h2>
              {subscriptionsLoading ? (
                <div className="border p-8 text-center">
                  <Loader2 className="text-muted-foreground mx-auto h-6 w-6 animate-spin" />
                  <p className="text-muted-foreground mt-2 text-sm">Loading subscriptions...</p>
                </div>
              ) : displaySubscriptions.length === 0 ? (
                <div className="border border-dashed p-8 text-center">
                  <Bot className="text-muted-foreground/50 mx-auto h-8 w-8" strokeWidth={1} />
                  <p className="text-muted-foreground mt-2 text-sm">No active subscriptions</p>
                  <p className="text-muted-foreground/70 mt-1 text-xs">
                    Subscribe to an agent to start earning yield
                  </p>
                </div>
              ) : (
                displaySubscriptions.map((subscription) => (
                  <button
                    key={subscription.agent.id}
                    onClick={() => setSelectedSubscription(subscription)}
                    className={`hover:border-foreground/20 w-full border p-4 text-left transition-colors ${
                      selectedSubscription?.agent.id === subscription.agent.id
                        ? "border-foreground bg-accent/50"
                        : "bg-background"
                    }`}
                    data-testid={`subscription-item-${subscription.agent.id}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-muted flex h-10 w-10 items-center justify-center border">
                          <Bot className="text-muted-foreground h-5 w-5" strokeWidth={1.5} />
                        </div>
                        <div>
                          <p className="font-medium">{subscription.agent.identity.name}</p>
                          <p className="text-muted-foreground font-mono text-xs">
                            {subscription.agent.strategy.pair} •{" "}
                            {CHAIN_NAMES[subscription.agent.strategy.chainId]}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="text-muted-foreground h-4 w-4" strokeWidth={1.5} />
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 border-t pt-3">
                      <div>
                        <span className="text-muted-foreground text-[10px]">Value</span>
                        <p className="font-mono text-sm font-medium">
                          ${subscription.position.valueUsd.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-[10px]">APY</span>
                        <p className="text-success font-mono text-sm font-medium">
                          {subscription.stats.realizedApy}%
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-[10px]">Status</span>
                        <p className="font-mono text-sm">
                          {subscription.position.inRange ? (
                            <Badge variant="secondary" className="text-[10px]">
                              In Range
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px]">
                              Out of Range
                            </Badge>
                          )}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="lg:col-span-8">
              {selectedSubscription ? (
                <PositionDetail
                  subscription={selectedSubscription}
                  onRevoked={() => {
                    setSelectedSubscription(null);
                    refresh();
                  }}
                />
              ) : (
                <Card className="flex h-full min-h-[500px] items-center justify-center border-dashed">
                  <CardContent className="text-center">
                    <Bot
                      className="text-muted-foreground/50 mx-auto mb-4 h-12 w-12"
                      strokeWidth={1}
                    />
                    <p className="text-muted-foreground">Select a position to view details</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Position Detail Component
// -----------------------------------------------------------------------------

function PositionDetail({
  subscription,
  onRevoked,
}: {
  subscription: SubscribedAgent;
  onRevoked: () => void;
}) {
  const { agent, position, stats, recentActivity, smartAccount } = subscription;
  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const { revokeAgent } = useSmartAccount();
  const [revokeStatus, setRevokeStatus] = useState<"idle" | "revoking" | "success" | "error">(
    "idle"
  );
  const [showRevokeModal, setShowRevokeModal] = useState(false);

  const handleRevoke = async () => {
    setShowRevokeModal(false);
    setRevokeStatus("revoking");
    setTimeout(async () => {
      try {
        // Read permissionId from localStorage
        const stored = JSON.parse(localStorage.getItem("prismos_subscriptions") || "[]");
        const localSub = stored.find((s: { agentId?: string }) => s.agentId === agent.id);
        const permissionId = localSub?.permissionId;

        if (!permissionId) {
          throw new Error("Permission ID not found. Cannot revoke on-chain.");
        }

        // 1. On-chain revocation
        const txHash = await revokeAgent(smartAccount as Address, permissionId as Hex);

        if (!txHash) {
          throw new Error("On-chain revocation failed");
        }

        // 2. API revocation (non-blocking)
        try {
          await api.revokeSubscription({
            smartAccount,
            userAddress: localSub.agentWallet,
          });
        } catch {
          // Non-blocking
        }

        setRevokeStatus("success");

        // 3. Refresh parent
        setTimeout(() => onRevoked(), 1500);
      } catch (err) {
        console.error("[Dashboard] Revoke error:", err);
        toast.error("Failed to revoke access");
        setRevokeStatus("error");
      }
    }, 1000);
  };

  return (
    <Card className="h-full" data-testid={`position-detail-${agent.id}`}>
      <CardHeader className="border-b">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-muted flex h-12 w-12 items-center justify-center border">
              <Bot className="text-muted-foreground h-6 w-6" strokeWidth={1.5} />
            </div>
            <div>
              <CardTitle className="text-xl">{agent.identity.name}</CardTitle>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {agent.strategy.pair}
                </Badge>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {CHAIN_NAMES[agent.strategy.chainId]}
                </Badge>
                {position.inRange ? (
                  <Badge variant="ghost" className="text-[10px]">
                    In Range
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-[10px]">
                    Out of Range
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1 font-mono text-[10px]">
                <span className="text-muted-foreground">Smart Account:</span>
                <span>{truncateAddress(smartAccount)}</span>
                <a
                  href={`https://arbiscan.io/address/${smartAccount}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <p className="font-mono text-2xl font-bold">
                ${position.valueUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </p>
              <p className="text-success font-mono text-sm">+{stats.realizedApy}% APY</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowRevokeModal(true)}
              disabled={revokeStatus === "revoking" || revokeStatus === "success"}
            >
              {revokeStatus === "revoking" ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Revoking...
                </>
              ) : revokeStatus === "success" ? (
                <>
                  <Check className="h-3 w-3" />
                  Revoked
                </>
              ) : (
                <>
                  <ShieldOff className="h-3 w-3" />
                  Revoke Access
                </>
              )}
            </Button>
            {showRevokeModal && (
              <RevokeModal
                onClose={() => setShowRevokeModal(false)}
                onRevoke={handleRevoke}
                agent={agent}
              />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <Tabs defaultValue="position" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="position">
              <Wallet />
              Position
            </TabsTrigger>
            <TabsTrigger value="performance">
              <TrendingUp />
              Performance
            </TabsTrigger>
            <TabsTrigger value="activity">
              <Activity />
              Activity
            </TabsTrigger>
          </TabsList>

          {/* Position Tab */}
          <TabsContent value="position" className="space-y-4 p-6">
            {/* Token Balances */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="border p-4">
                <span className="text-muted-foreground font-mono text-[10px] uppercase">
                  {position.token0Symbol}
                </span>
                <p className="font-mono text-2xl font-bold">{position.token0Amount.toFixed(4)}</p>
              </div>
              <div className="border p-4">
                <span className="text-muted-foreground font-mono text-[10px] uppercase">
                  {position.token1Symbol}
                </span>
                <p className="font-mono text-2xl font-bold">{position.token1Amount.toFixed(4)}</p>
              </div>
            </div>

            {/* Range Info */}
            <div className="border p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-muted-foreground font-mono text-[10px] uppercase">
                  Price Range
                </span>
                <Target className="text-muted-foreground h-4 w-4" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-muted-foreground text-xs">Min</span>
                  <p className="font-mono text-lg font-bold">{position.rangeLower}</p>
                </div>
                <div className="bg-muted mx-4 h-2 flex-1">
                  <div
                    className="bg-success h-full"
                    style={{ width: position.inRange ? "60%" : "0%" }}
                  />
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground text-xs">Max</span>
                  <p className="font-mono text-lg font-bold">{position.rangeUpper}</p>
                </div>
              </div>
            </div>

            {/* Unclaimed Fees */}
            <div className="bg-warning/5 border-warning/20 border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-muted-foreground font-mono text-[10px] uppercase">
                    Unclaimed Fees
                  </span>
                  <p className="text-warning font-mono text-xl font-bold">
                    ${position.unclaimedFees.toFixed(2)}
                  </p>
                </div>
                <p className="text-muted-foreground text-xs">
                  Agent will collect when threshold reached
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-4 p-6">
            {/* Yield Breakdown */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="border p-4">
                <div className="mb-2 flex items-center gap-2">
                  <ArrowUpRight className="text-success h-4 w-4" />
                  <span className="text-muted-foreground font-mono text-[10px] uppercase">
                    Fees Collected
                  </span>
                </div>
                <p className="font-mono text-2xl font-bold">
                  ${stats.totalFeesCollected.toFixed(2)}
                </p>
              </div>
              <div className="border p-4">
                <div className="mb-2 flex items-center gap-2">
                  <RefreshCw className="text-brand h-4 w-4" />
                  <span className="text-muted-foreground font-mono text-[10px] uppercase">
                    Compounded
                  </span>
                </div>
                <p className="font-mono text-2xl font-bold">${stats.totalCompounded.toFixed(2)}</p>
              </div>
              <div className="border p-4">
                <div className="mb-2 flex items-center gap-2">
                  <DollarSign className="text-success h-4 w-4" />
                  <span className="text-muted-foreground font-mono text-[10px] uppercase">
                    Distributed
                  </span>
                </div>
                <p className="font-mono text-2xl font-bold">${stats.totalDistributed.toFixed(2)}</p>
              </div>
              <div className="border p-4">
                <div className="mb-2 flex items-center gap-2">
                  <ArrowDownRight className="text-muted-foreground h-4 w-4" />
                  <span className="text-muted-foreground font-mono text-[10px] uppercase">
                    Agent Fees
                  </span>
                </div>
                <p className="text-muted-foreground font-mono text-2xl font-bold">
                  -${stats.feesPaidToAgent.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Action Stats */}
            <div className="border p-4">
              <h4 className="text-muted-foreground mb-4 font-mono text-xs uppercase">
                Agent Actions (since{" "}
                {stats.subscribedAt.toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
                )
              </h4>
              <div className="grid grid-cols-5 gap-2 text-center">
                <div>
                  <p className="font-mono text-xl font-bold">{stats.actionsCount.collect}</p>
                  <span className="text-muted-foreground text-[10px]">Collects</span>
                </div>
                <div>
                  <p className="font-mono text-xl font-bold">{stats.actionsCount.compound}</p>
                  <span className="text-muted-foreground text-[10px]">Compounds</span>
                </div>
                <div>
                  <p className="font-mono text-xl font-bold">{stats.actionsCount.rebalance}</p>
                  <span className="text-muted-foreground text-[10px]">Rebalances</span>
                </div>
                <div>
                  <p className="font-mono text-xl font-bold">{stats.actionsCount.rangeAdjust}</p>
                  <span className="text-muted-foreground text-[10px]">Range Adj.</span>
                </div>
                <div>
                  <p className="font-mono text-xl font-bold">{stats.actionsCount.distribute}</p>
                  <span className="text-muted-foreground text-[10px]">Distributes</span>
                </div>
              </div>
            </div>

            {/* Net Yield */}
            <div className="bg-success/5 border-success/20 border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-muted-foreground font-mono text-[10px] uppercase">
                    Net Yield (after agent fees)
                  </span>
                  <p className="text-success font-mono text-2xl font-bold">
                    +${stats.netYield.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground font-mono text-[10px] uppercase">
                    Realized APY
                  </span>
                  <p className="text-success font-mono text-2xl font-bold">{stats.realizedApy}%</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="activity" className="p-6">
            <div className="bg-muted/30 max-h-96 space-y-1 overflow-y-auto border p-4 font-mono text-xs">
              {recentActivity.map((log) => (
                <div key={log.id} className="flex gap-3 border-b py-2 last:border-0">
                  <span className="text-muted-foreground shrink-0">
                    {log.timestamp.toLocaleString()}
                  </span>
                  <span
                    className={`shrink-0 uppercase ${
                      log.status === "failed"
                        ? "text-destructive"
                        : log.status === "pending"
                          ? "text-warning"
                          : "text-success"
                    }`}
                  >
                    [{log.type}]
                  </span>
                  <span className="flex-1">{log.details}</span>
                  {log.fee !== undefined && (
                    <span className="text-muted-foreground shrink-0">-${log.fee.toFixed(2)}</span>
                  )}
                  {log.amount !== undefined && !log.fee && (
                    <span className="text-success shrink-0">+${log.amount.toFixed(2)}</span>
                  )}
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
