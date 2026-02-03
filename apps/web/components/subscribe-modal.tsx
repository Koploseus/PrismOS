"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Zap,
  Check,
  ArrowRight,
  Loader2,
  X,
  Wallet,
  Settings,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { Agent, CHAIN_NAMES, ChainId } from "@/lib/types";
import { useSmartAccount } from "@/hooks/useSmartAccount";

type Step = "connect" | "activate" | "config" | "delegate" | "complete";

interface SubscribeModalProps {
  agent: Agent;
  onClose: () => void;
  onSuccess?: () => void;
}

interface SubscriptionConfig {
  compound: number;
  destination: string;
  destChain: string;
}

const STEPS: Step[] = ["connect", "activate", "config", "delegate", "complete"];

const STEP_INFO: Record<Step, { label: string; icon: React.ReactNode }> = {
  connect: { label: "Connect", icon: <Wallet className="h-4 w-4" /> },
  activate: { label: "Activate", icon: <Zap className="h-4 w-4" /> },
  config: { label: "Configure", icon: <Settings className="h-4 w-4" /> },
  delegate: { label: "Delegate", icon: <Shield className="h-4 w-4" /> },
  complete: { label: "Complete", icon: <Check className="h-4 w-4" /> },
};

const DESTINATION_CHAINS: { value: string; label: string }[] = [
  { value: "42161", label: "Arbitrum" },
  { value: "8453", label: "Base" },
  { value: "1", label: "Ethereum" },
  { value: "137", label: "Polygon" },
  { value: "100", label: "Gnosis Chain" },
];

export function SubscribeModal({ agent, onClose, onSuccess }: SubscribeModalProps) {
  const { address, isConnected } = useAccount();
  const {
    smartAccount,
    sessionKey,
    loading,
    error,
    initSmartAccount,
    delegateToAgent,
    reset,
  } = useSmartAccount();

  const [step, setStep] = useState<Step>("connect");
  const [localError, setLocalError] = useState<string | null>(null);
  const [config, setConfig] = useState<SubscriptionConfig>({
    compound: 70,
    destination: "",
    destChain: "42161",
  });

  const displayError = localError || error;
  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const currentStepIndex = STEPS.indexOf(step);

  useEffect(() => {
    if (isConnected && step === "connect") {
      setStep("activate");
    }
    if (!isConnected && step !== "connect") {
      setStep("connect");
      reset();
    }
  }, [isConnected, step, reset]);

  useEffect(() => {
    setLocalError(null);
  }, [step]);

  const handleActivateAccount = async () => {
    setLocalError(null);

    try {
      const account = await initSmartAccount();
      if (account) {
        setStep("config");
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to create smart account");
    }
  };

  const handleConfigSubmit = () => {
    if (config.destination && !config.destination.match(/^0x[a-fA-F0-9]{40}$/)) {
      setLocalError("Invalid destination address format");
      return;
    }
    setStep("delegate");
  };

  const handleDelegate = async () => {
    setLocalError(null);

    if (!smartAccount) {
      setLocalError("Smart account not activated");
      return;
    }

    try {
      const grant = await delegateToAgent(agent.identity.wallet);

      if (!grant) {
        throw new Error("Failed to create session key");
      }

      const AGENT_API_URL = process.env.NEXT_PUBLIC_AGENT_API_URL || "http://localhost:3001";

      try {
        const response = await fetch(`${AGENT_API_URL}/api/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userAddress: address,
            smartAccount: grant.smartAccountAddress,
            sessionKeyAddress: grant.sessionKeyAddress,
            sessionPrivateKey: grant.sessionPrivateKey,
            serializedSessionKey: grant.serialized,
            agentEns: agent.identity.ensName,
            config: config,
          }),
        });

        if (response.ok) {
          await response.json();
        }
      } catch {
        // Agent API registration is non-blocking
      }

      const subscriptions = JSON.parse(
        localStorage.getItem("prismos_subscriptions") || "[]"
      );
      subscriptions.push({
        agentId: agent.id,
        agentEns: agent.identity.ensName,
        agentWallet: agent.identity.wallet,
        smartAccount: grant.smartAccountAddress,
        sessionKeyAddress: grant.sessionKeyAddress,
        serializedGrant: grant.serialized,
        config,
        timestamp: Date.now(),
      });
      localStorage.setItem("prismos_subscriptions", JSON.stringify(subscriptions));

      setStep("complete");
      onSuccess?.();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Failed to create session key");
    }
  };

  const renderProgressBar = () => (
    <div className="flex gap-1.5 px-6 py-4">
      {STEPS.map((s, i) => (
        <div
          key={s}
          className={`flex-1 h-1 transition-colors ${
            i <= currentStepIndex ? "bg-primary" : "bg-muted"
          }`}
        />
      ))}
    </div>
  );

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 text-muted-foreground font-mono text-[10px] uppercase mb-4">
      {STEP_INFO[step].icon}
      <span>
        Step {currentStepIndex + 1} of {STEPS.length}
      </span>
    </div>
  );

  const renderError = () =>
    displayError && (
      <div className="mx-6 mb-4 flex items-start gap-3 border border-destructive/30 bg-destructive/10 p-3">
        <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
        <div className="text-sm text-destructive">{displayError}</div>
      </div>
    );

  const renderConnectStep = () => (
    <div className="space-y-6 text-center">
      {renderStepIndicator()}
      <div className="bg-muted flex h-16 w-16 items-center justify-center border mx-auto">
        <Wallet className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <div>
        <h3 className="font-semibold text-lg">Connect Your Wallet</h3>
        <p className="text-muted-foreground text-sm mt-2">
          Connect your wallet to create a Smart Account and subscribe to this agent.
        </p>
      </div>
      <div className="bg-muted/50 border p-4 text-sm text-muted-foreground">
        Use the <span className="text-foreground font-medium">Connect Wallet</span> button in
        the header to connect.
      </div>
    </div>
  );

  const renderActivateStep = () => (
    <div className="space-y-6">
      {renderStepIndicator()}
      <div className="text-center">
        <div className="bg-muted flex h-16 w-16 items-center justify-center border mx-auto mb-4">
          <Zap className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <h3 className="font-semibold text-lg">Activate Your Account</h3>
        <p className="text-muted-foreground text-sm mt-2">
          Create a ZeroDev Smart Account (ERC-4337)
        </p>
      </div>

      <div className="border p-4 space-y-3">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-medium">ERC-4337 Smart Account</div>
            <div className="text-xs text-muted-foreground">Powered by ZeroDev Kernel v0.3.1</div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-medium">Counterfactual Deployment</div>
            <div className="text-xs text-muted-foreground">
              Account deployed on first transaction
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-medium">You Retain Full Control</div>
            <div className="text-xs text-muted-foreground">Revoke agent access anytime</div>
          </div>
        </div>
      </div>

      <div className="border p-4">
        <div className="text-muted-foreground font-mono text-[10px] uppercase mb-1">
          Connected Wallet (Owner)
        </div>
        <div className="font-mono text-sm break-all">{address}</div>
      </div>

      <Button onClick={handleActivateAccount} disabled={loading} className="w-full" size="lg">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating Smart Account...
          </>
        ) : (
          <>
            <Zap className="h-4 w-4" />
            Activate Account
          </>
        )}
      </Button>
    </div>
  );

  const renderConfigStep = () => (
    <div className="space-y-6">
      {renderStepIndicator()}
      <div className="text-center">
        <h3 className="font-semibold text-lg">Configure Preferences</h3>
        <p className="text-muted-foreground text-sm mt-1">
          How should the agent manage your yield?
        </p>
      </div>

      {smartAccount && (
        <div className="border border-primary/20 bg-primary/5 p-4">
          <div className="text-muted-foreground font-mono text-[10px] uppercase mb-1">
            Smart Account Address
          </div>
          <div className="font-mono text-sm break-all">{smartAccount.address}</div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-muted-foreground font-mono text-[10px] uppercase block">
          Compound vs Distribute
        </label>
        <input
          type="range"
          min="0"
          max="90"
          value={config.compound}
          onChange={(e) => setConfig({ ...config, compound: Number(e.target.value) })}
          className="w-full accent-primary h-2 bg-muted rounded-none appearance-none cursor-pointer"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{config.compound}% reinvested</span>
          <span>{90 - config.compound}% distributed</span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-muted-foreground font-mono text-[10px] uppercase block">
          Destination Address
        </label>
        <input
          type="text"
          placeholder="0x... (for yield distribution)"
          value={config.destination}
          onChange={(e) => setConfig({ ...config, destination: e.target.value })}
          className="w-full bg-muted border px-4 py-3 text-sm font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      <div className="space-y-2">
        <label className="text-muted-foreground font-mono text-[10px] uppercase block">
          Destination Chain
        </label>
        <select
          value={config.destChain}
          onChange={(e) => setConfig({ ...config, destChain: e.target.value })}
          className="w-full bg-muted border px-4 py-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {DESTINATION_CHAINS.map((chain) => (
            <option key={chain.value} value={chain.value}>
              {chain.label}
            </option>
          ))}
        </select>
      </div>

      <Button onClick={handleConfigSubmit} className="w-full" size="lg">
        Continue
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );

  const renderDelegateStep = () => (
    <div className="space-y-6">
      {renderStepIndicator()}
      <div className="text-center">
        <div className="bg-muted flex h-16 w-16 items-center justify-center border mx-auto mb-4">
          <Shield className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <h3 className="font-semibold text-lg">Delegate to Agent</h3>
        <p className="text-muted-foreground text-sm mt-1">
          Grant limited permissions to {agent.identity.name}
        </p>
      </div>

      <div className="border p-4 space-y-3">
        <div className="text-muted-foreground font-mono text-[10px] uppercase mb-2">
          Granted Permissions
        </div>
        {agent.permissions.permissions.map((perm) => (
          <div key={perm} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
            <span className="font-mono">{perm}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 text-sm text-destructive">
          <X className="h-4 w-4 shrink-0" />
          <span className="font-mono">transfer / burn / withdraw (BLOCKED)</span>
        </div>
      </div>

      <div className="border border-success/20 bg-success/5 p-4">
        <div className="flex items-start gap-3">
          <Shield className="h-4 w-4 text-success mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-medium text-success mb-1">Safe by Design</div>
            <div className="text-muted-foreground text-xs">
              Session keys are scoped via ZeroDev CallPolicy. The agent can only call specific
              functions on approved contracts.
            </div>
          </div>
        </div>
      </div>

      <div className="border p-4">
        <div className="text-muted-foreground font-mono text-[10px] uppercase mb-1">
          Agent Wallet
        </div>
        <div className="font-mono text-sm break-all">{agent.identity.wallet}</div>
      </div>

      <div className="border border-primary/20 bg-primary/5 p-4 text-sm">
        <div className="text-muted-foreground mb-2">This transaction will:</div>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground text-xs">
          <li>Deploy your Smart Account on-chain</li>
          <li>Install session key permissions for the agent</li>
        </ul>
        <div className="text-xs text-primary mt-2">Gas is sponsored by ZeroDev.</div>
      </div>

      <Button onClick={handleDelegate} disabled={loading} className="w-full" size="lg">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Deploying & Installing Permissions...
          </>
        ) : (
          <>
            <Shield className="h-4 w-4" />
            Deploy & Delegate
          </>
        )}
      </Button>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="space-y-6">
      {renderStepIndicator()}
      <div className="text-center">
        <div className="bg-success/10 flex h-16 w-16 items-center justify-center border border-success/20 mx-auto mb-4">
          <CheckCircle2 className="h-8 w-8 text-success" strokeWidth={1.5} />
        </div>
        <h3 className="font-semibold text-lg">You're Subscribed!</h3>
        <p className="text-muted-foreground text-sm mt-2">
          <span className="text-foreground font-medium">{agent.identity.name}</span> will now
          manage your LP position.
        </p>
      </div>

      {sessionKey && (
        <div className="border p-4 space-y-3">
          <div className="text-muted-foreground font-mono text-[10px] uppercase">
            Your Smart Account
          </div>
          <div className="font-mono text-sm break-all">{sessionKey.smartAccountAddress}</div>
          {sessionKey.deploymentTxHash && (
            <a
              href={`https://arbiscan.io/tx/${sessionKey.deploymentTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              View deployment transaction
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      <div className="border border-primary/20 bg-primary/5 p-4">
        <div className="font-medium text-sm mb-3">Next Steps:</div>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground text-sm">
          <li>Deposit tokens to your Smart Account</li>
          <li>The agent will create your LP position</li>
          <li>Monitor activity in your Dashboard</li>
        </ol>
      </div>

      <div className="flex gap-3">
        <Button asChild className="flex-1">
          <a href="/dashboard">Go to Dashboard</a>
        </Button>
        <Button variant="outline" onClick={onClose} className="flex-1">
          Close
        </Button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <Card className="max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <CardHeader className="border-b shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg">Subscribe to {agent.identity.name}</CardTitle>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {agent.identity.ensName}
                </Badge>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {CHAIN_NAMES[agent.strategy.chainId as ChainId]}
                </Badge>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        {renderProgressBar()}
        {renderError()}

        <CardContent className="flex-1 overflow-y-auto">
          {step === "connect" && renderConnectStep()}
          {step === "activate" && renderActivateStep()}
          {step === "config" && renderConfigStep()}
          {step === "delegate" && renderDelegateStep()}
          {step === "complete" && renderCompleteStep()}
        </CardContent>
      </Card>
    </div>
  );
}
