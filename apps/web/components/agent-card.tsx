"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, TrendingUp, Users, Percent } from "lucide-react";
import { Agent, CHAIN_NAMES, formatFee } from "@/lib/types";

interface AgentCardProps {
  agent: Agent;
  onSubscribe?: (agent: Agent) => void;
  onSelect?: (agent: Agent) => void;
  isSubscribed?: boolean;
}

const riskColors: Record<string, string> = {
  low: "bg-success/10 text-success border-success/20",
  medium: "bg-warning/10 text-warning border-warning/20",
  high: "bg-destructive/10 text-destructive border-destructive/20",
};

export function AgentCard({ agent, onSubscribe, onSelect, isSubscribed }: AgentCardProps) {
  const { identity, strategy, fees, stats } = agent;

  return (
    <Card
      className="hover:border-foreground/20 flex h-full cursor-pointer flex-col transition-colors"
      data-testid={`agent-card-${agent.id}`}
      onClick={() => onSelect?.(agent)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="bg-muted flex h-10 w-10 items-center justify-center border">
            <Bot className="text-muted-foreground h-5 w-5" strokeWidth={1.5} />
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`font-mono text-[10px] uppercase ${riskColors[strategy.risk]}`}
            >
              {strategy.risk}
            </Badge>
            <Badge variant="secondary" className="font-mono text-[10px]">
              {CHAIN_NAMES[strategy.chainId]}
            </Badge>
          </div>
        </div>
        <CardTitle className="mt-3 text-lg font-semibold">{identity.name}</CardTitle>
        <CardDescription className="line-clamp-2 text-sm">{identity.description}</CardDescription>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        {/* Strategy */}
        <div className="flex items-center justify-between border-b pb-3">
          <span className="text-muted-foreground text-xs">Strategy</span>
          <span className="font-mono text-sm font-medium">{strategy.pair}</span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <TrendingUp className="text-success h-3 w-3" strokeWidth={1.5} />
              <span className="font-mono text-sm font-bold">{stats.apy30d}%</span>
            </div>
            <span className="text-muted-foreground text-[10px]">APY 30d</span>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <span className="font-mono text-sm font-bold">
                ${(stats.tvl / 1_000_000).toFixed(1)}M
              </span>
            </div>
            <span className="text-muted-foreground text-[10px]">TVL</span>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <Users className="text-muted-foreground h-3 w-3" strokeWidth={1.5} />
              <span className="font-mono text-sm font-bold">{stats.subscribers}</span>
            </div>
            <span className="text-muted-foreground text-[10px]">Users</span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex items-center justify-between border-t pt-4">
        <div className="flex items-center gap-2">
          <Percent className="text-muted-foreground h-3 w-3" strokeWidth={1.5} />
          <span className="text-muted-foreground text-xs">Fees:</span>
          <span className="font-mono text-xs">{formatFee(fees.collect, true)}</span>
        </div>
        {isSubscribed ? (
          <Badge variant="default" className="bg-success font-mono text-[10px]">
            Subscribed
          </Badge>
        ) : (
          <Button
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onSubscribe?.(agent);
            }}
            data-testid={`subscribe-btn-${agent.id}`}
          >
            Subscribe
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
