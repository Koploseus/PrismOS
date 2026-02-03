"use client";

import { useState } from "react";
import { AgentCard } from "@/components/agent-card";
import { AgentDetailPanel } from "@/components/agent-detail-panel";
import { SubscribeModal } from "@/components/subscribe-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Grid3X3, List, X } from "lucide-react";
import { useConnection } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AGENTS } from "@/lib/agents";
import { Agent, CHAIN_NAMES, ChainId, RiskLevel } from "@/lib/types";

type ViewMode = "grid" | "list";

export default function MarketplacePage() {
  const { isConnected } = useConnection();
  const [searchQuery, setSearchQuery] = useState("");
  const [subscribedAgents, setSubscribedAgents] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedChain, setSelectedChain] = useState<string>("");
  const [selectedRisk, setSelectedRisk] = useState<string>("");
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [agentToSubscribe, setAgentToSubscribe] = useState<Agent | null>(null);

  const filteredAgents = AGENTS.filter((agent) => {
    const matchesSearch =
      agent.identity.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.identity.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.strategy.pair.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.strategy.protocol.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesChain = !selectedChain || agent.strategy.chainId.toString() === selectedChain;
    const matchesRisk = !selectedRisk || agent.strategy.risk === selectedRisk;

    return matchesSearch && matchesChain && matchesRisk;
  });

  const handleSubscribe = (agent: Agent) => {
    setAgentToSubscribe(agent);
    setShowSubscribeModal(true);
  };

  const handleSubscriptionSuccess = () => {
    if (agentToSubscribe) {
      setSubscribedAgents((prev) => new Set(prev).add(agentToSubscribe.id));
    }
  };

  const handleCloseModal = () => {
    setShowSubscribeModal(false);
    setAgentToSubscribe(null);
  };

  const handleSelectAgent = (agent: Agent) => {
    setSelectedAgent(agent);
  };

  const clearFilters = () => {
    setSelectedChain("");
    setSelectedRisk("");
    setSearchQuery("");
  };

  const hasActiveFilters = selectedChain || selectedRisk || searchQuery;

  // Calculate total TVL
  const totalTvl = AGENTS.reduce((sum, agent) => sum + agent.stats.tvl, 0);

  return (
    <div className="min-h-screen" data-testid="marketplace-page">
      {/* Hero Section */}
      <section className="border-b">
        <div className="mx-auto max-w-7xl px-4 py-16 md:px-6 md:py-24">
          <div className="max-w-3xl">
            <h1 className="font-mono text-4xl font-bold tracking-tight md:text-6xl">
              Agent Marketplace
            </h1>
            <p className="text-muted-foreground mt-4 text-lg">
              Discover and subscribe to autonomous DeFi agents. They manage your LP positions,
              collect fees, rebalance, and compound — all paid via x402 micropayments.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <div className="border px-4 py-2">
                <span className="text-muted-foreground text-xs">Total TVL</span>
                <p className="font-mono text-xl font-bold">${(totalTvl / 1_000_000).toFixed(1)}M</p>
              </div>
              <div className="border px-4 py-2">
                <span className="text-muted-foreground text-xs">Active Agents</span>
                <p className="font-mono text-xl font-bold">{AGENTS.length}</p>
              </div>
              <div className="border px-4 py-2">
                <span className="text-muted-foreground text-xs">Total Subscribers</span>
                <p className="font-mono text-xl font-bold">
                  {AGENTS.reduce((sum, a) => sum + a.stats.subscribers, 0)}
                </p>
              </div>
            </div>
            {!isConnected && (
              <div className="mt-8">
                <ConnectButton />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Search and Filters */}
      <section className="bg-muted/30 border-b">
        <div className="mx-auto max-w-7xl px-4 py-4 md:px-6">
          <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                strokeWidth={1.5}
              />
              <input
                type="text"
                placeholder="Search agents, pairs, protocols..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-background focus:ring-ring w-full border py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-1"
                data-testid="search-input"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Chain Filter */}
              <Select value={selectedChain} onValueChange={(chainId) => setSelectedChain(chainId)}>
                <SelectTrigger className="!bg-background w-[180px]">
                  <SelectValue placeholder="Chain" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.entries(CHAIN_NAMES).map(([id, name]) => (
                      <SelectItem key={id} value={id}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>

              {/* Risk Filter */}
              <Select value={selectedRisk} onValueChange={(risk) => setSelectedRisk(risk)}>
                <SelectTrigger className="!bg-background w-[180px]">
                  <SelectValue placeholder="Risk" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="low">Low Risk</SelectItem>
                    <SelectItem value="medium">Medium Risk</SelectItem>
                    <SelectItem value="high">High Risk</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="mr-1 h-3 w-3" />
                  Clear
                </Button>
              )}

              <div className="flex border">
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setViewMode("grid")}
                  data-testid="view-grid"
                >
                  <Grid3X3 className="h-4 w-4" strokeWidth={1.5} />
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setViewMode("list")}
                  data-testid="view-list"
                >
                  <List className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              </div>
            </div>
          </div>

          {/* Active Filters */}
          {hasActiveFilters && (
            <div className="mt-3 flex flex-wrap gap-2">
              {searchQuery && (
                <Badge variant="secondary" className="font-mono text-xs">
                  Search: {searchQuery}
                  <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setSearchQuery("")} />
                </Badge>
              )}
              {selectedChain && (
                <Badge variant="secondary" className="font-mono text-xs">
                  Chain: {CHAIN_NAMES[Number(selectedChain) as ChainId]}
                  <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setSelectedChain("")} />
                </Badge>
              )}
              {selectedRisk && (
                <Badge variant="secondary" className="font-mono text-xs">
                  Risk: {selectedRisk}
                  <X className="ml-1 h-3 w-3 cursor-pointer" onClick={() => setSelectedRisk("")} />
                </Badge>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Main Content - Agent Grid + Detail Panel */}
      <section>
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
          <div className="mb-6 flex items-center justify-between">
            <p className="text-muted-foreground font-mono text-sm">
              <span className="text-foreground font-bold">{filteredAgents.length}</span> agents
              {filteredAgents.length !== AGENTS.length &&
                ` (filtered from ${AGENTS.length})`}
            </p>
            <CreateAgentDialog onCreateAgent={handleCreateAgent} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Agent Grid/List */}
            <div className={selectedAgent ? "lg:col-span-5" : "lg:col-span-12"}>
              <div
                className={
                  viewMode === "grid"
                    ? selectedAgent
                      ? "grid grid-cols-1 gap-4"
                      : "grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3"
                    : "flex flex-col gap-4"
                }
              >
                {filteredAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onSubscribe={handleSubscribe}
                    onSelect={handleSelectAgent}
                    isSubscribed={subscribedAgents.has(agent.id)}
                  />
                ))}
              </div>
              {filteredAgents.length === 0 && (
                <div className="border border-dashed py-16 text-center">
                  <p className="text-muted-foreground">No agents found matching your filters.</p>
                  <Button variant="link" onClick={clearFilters} className="mt-2">
                    Clear all filters
                  </Button>
                </div>
              )}
            </div>

            {/* Detail Panel */}
            {selectedAgent && (
              <div className="lg:col-span-7">
                <div className="sticky top-4">
                  <AgentDetailPanel
                    agent={selectedAgent}
                    onSubscribe={handleSubscribe}
                    onClose={() => setSelectedAgent(null)}
                    isSubscribed={subscribedAgents.has(selectedAgent.id)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {showSubscribeModal && agentToSubscribe && (
        <SubscribeModal
          agent={agentToSubscribe}
          onClose={handleCloseModal}
          onSuccess={handleSubscriptionSuccess}
        />
      )}
    </div>
  );
}
