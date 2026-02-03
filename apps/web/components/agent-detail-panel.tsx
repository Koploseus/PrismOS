"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Bot,
  Activity,
  TrendingUp,
  Clock,
  CheckCircle2,
  Shield,
  Coins,
  ExternalLink,
  Copy,
  Users,
  X,
} from "lucide-react";
import { Agent, CHAIN_NAMES, formatFee } from "@/lib/types";

interface AgentDetailPanelProps {
  agent: Agent;
  onSubscribe?: (agent: Agent) => void;
  onClose?: () => void;
  isSubscribed?: boolean;
}

const riskColors: Record<string, string> = {
  low: "bg-success/10 text-success border-success/20",
  medium: "bg-warning/10 text-warning border-warning/20",
  high: "bg-destructive/10 text-destructive border-destructive/20",
};

export function AgentDetailPanel({
  agent,
  onSubscribe,
  onClose,
  isSubscribed,
}: AgentDetailPanelProps) {
  const { identity, strategy, fees, permissions, stats } = agent;

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <Card className="h-full" data-testid={`agent-detail-${agent.id}`}>
      <CardHeader className="border-b">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-muted flex h-12 w-12 items-center justify-center border">
              <Bot className="text-muted-foreground h-6 w-6" strokeWidth={1.5} />
            </div>
            <div>
              <CardTitle className="text-xl">{identity.name}</CardTitle>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="success" className="font-mono text-[10px]">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Active
                </Badge>
                <Badge
                  variant="outline"
                  className={`font-mono text-[10px] uppercase ${riskColors[strategy.risk]}`}
                >
                  {strategy.risk} risk
                </Badge>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {CHAIN_NAMES[strategy.chainId]}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isSubscribed ? (
              <Badge variant="success" className="font-mono text-[10px]">
                Subscribed
              </Badge>
            ) : (
              <Button size="sm" onClick={() => onSubscribe?.(agent)} data-testid="subscribe-btn">
                Subscribe
              </Button>
            )}
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose} data-testid="close-btn">
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="h-auto w-full justify-start border-b bg-transparent p-0">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:border-foreground rounded-none px-4 py-3 font-mono text-xs uppercase data-[state=active]:border-b-2 data-[state=active]:bg-transparent"
            >
              <Activity className="mr-2 h-3.5 w-3.5" strokeWidth={1.5} />
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="fees"
              className="data-[state=active]:border-foreground rounded-none px-4 py-3 font-mono text-xs uppercase data-[state=active]:border-b-2 data-[state=active]:bg-transparent"
            >
              <Coins className="mr-2 h-3.5 w-3.5" strokeWidth={1.5} />
              Fees
            </TabsTrigger>
            <TabsTrigger
              value="permissions"
              className="data-[state=active]:border-foreground rounded-none px-4 py-3 font-mono text-xs uppercase data-[state=active]:border-b-2 data-[state=active]:bg-transparent"
            >
              <Shield className="mr-2 h-3.5 w-3.5" strokeWidth={1.5} />
              Permissions
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4 p-6">
            <p className="text-muted-foreground text-sm">{identity.description}</p>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="border p-4">
                <div className="text-muted-foreground mb-2 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" strokeWidth={1.5} />
                  <span className="font-mono text-[10px] uppercase">APY 30d</span>
                </div>
                <p className="text-success font-mono text-2xl font-bold">{stats.apy30d}%</p>
              </div>
              <div className="border p-4">
                <div className="text-muted-foreground mb-2 flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase">TVL</span>
                </div>
                <p className="font-mono text-2xl font-bold">
                  ${(stats.tvl / 1_000_000).toFixed(2)}M
                </p>
              </div>
              <div className="border p-4">
                <div className="text-muted-foreground mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4" strokeWidth={1.5} />
                  <span className="font-mono text-[10px] uppercase">Subscribers</span>
                </div>
                <p className="font-mono text-2xl font-bold">{stats.subscribers}</p>
              </div>
              <div className="border p-4">
                <div className="text-muted-foreground mb-2 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
                  <span className="font-mono text-[10px] uppercase">Success Rate</span>
                </div>
                <p className="font-mono text-2xl font-bold">{stats.successRate}%</p>
              </div>
            </div>

            {/* Strategy Details */}
            <div className="border p-4">
              <h4 className="text-muted-foreground mb-4 font-mono text-xs uppercase">Strategy</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-muted-foreground text-xs">Pair</span>
                  <p className="font-mono font-medium">{strategy.pair}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Protocol</span>
                  <p className="font-mono font-medium capitalize">{strategy.protocol}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Pool</span>
                  <p className="flex items-center gap-2 font-mono text-sm">
                    {truncateAddress(strategy.pool)}
                    <Copy className="h-3 w-3 cursor-pointer opacity-50 hover:opacity-100" />
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Total Actions</span>
                  <p className="font-mono font-medium">{stats.totalActions.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Uptime & Reliability */}
            <div className="grid grid-cols-2 gap-4">
              <div className="border p-4">
                <div className="text-muted-foreground mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4" strokeWidth={1.5} />
                  <span className="font-mono text-[10px] uppercase">Uptime</span>
                </div>
                <p className="font-mono text-2xl font-bold">{stats.uptime}%</p>
              </div>
              <div className="border p-4">
                <div className="text-muted-foreground mb-2 flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase">Active Since</span>
                </div>
                <p className="font-mono text-lg font-bold">
                  {stats.registeredAt.toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Fees Tab */}
          <TabsContent value="fees" className="space-y-4 p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-muted-foreground font-mono text-xs uppercase">
                    Collect Fee
                  </span>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    % of fees
                  </Badge>
                </div>
                <p className="font-mono text-2xl font-bold">{formatFee(fees.collect, true)}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Charged when agent collects LP fees
                </p>
              </div>
              <div className="border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-muted-foreground font-mono text-xs uppercase">
                    Compound Fee
                  </span>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    % of amount
                  </Badge>
                </div>
                <p className="font-mono text-2xl font-bold">{formatFee(fees.compound, true)}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Charged when reinvesting collected fees
                </p>
              </div>
              <div className="border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-muted-foreground font-mono text-xs uppercase">
                    Rebalance Fee
                  </span>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    flat
                  </Badge>
                </div>
                <p className="font-mono text-2xl font-bold">{formatFee(fees.rebalance, false)}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Fixed fee per rebalance operation
                </p>
              </div>
              <div className="border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-muted-foreground font-mono text-xs uppercase">
                    Range Adjust Fee
                  </span>
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    flat
                  </Badge>
                </div>
                <p className="font-mono text-2xl font-bold">{formatFee(fees.rangeAdjust, false)}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Fixed fee when adjusting LP range
                </p>
              </div>
            </div>
            <div className="bg-muted/30 border p-4">
              <p className="text-muted-foreground text-xs">
                All fees are paid via x402 micropayments through Yellow Network state channels.
                Settlements are batched daily for gas efficiency.
              </p>
            </div>
          </TabsContent>

          {/* Permissions Tab */}
          <TabsContent value="permissions" className="space-y-4 p-6">
            <div className="border p-4">
              <h4 className="text-muted-foreground mb-3 font-mono text-xs uppercase">
                Required Permissions
              </h4>
              <div className="flex flex-wrap gap-2">
                {permissions.permissions.map((perm) => (
                  <Badge key={perm} variant="outline" className="font-mono text-xs">
                    {perm}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="border p-4">
              <h4 className="text-muted-foreground mb-3 font-mono text-xs uppercase">
                Allowed Contracts
              </h4>
              <div className="space-y-2">
                {permissions.contracts.map((contract) => (
                  <div
                    key={contract}
                    className="bg-muted/30 flex items-center justify-between px-3 py-2"
                  >
                    <code className="text-xs">{truncateAddress(contract)}</code>
                    <ExternalLink className="h-3 w-3 cursor-pointer opacity-50 hover:opacity-100" />
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-success/5 border-success/20 border p-4">
              <p className="text-success text-xs">
                <Shield className="mr-2 inline h-4 w-4" />
                Session keys are scoped to these contracts only. The agent cannot access other
                contracts or transfer your funds directly.
              </p>
            </div>

            {/* ENS Info */}
            <div className="border p-4">
              <h4 className="text-muted-foreground mb-3 font-mono text-xs uppercase">
                Agent Identity
              </h4>
              <div className="space-y-3">
                <div>
                  <span className="text-muted-foreground text-xs">ENS Name</span>
                  <p className="font-mono text-sm">{identity.ensName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Agent Wallet</span>
                  <p className="flex items-center gap-2 font-mono text-sm">
                    {truncateAddress(identity.wallet)}
                    <Copy className="h-3 w-3 cursor-pointer opacity-50 hover:opacity-100" />
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
