"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
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
  const { smartAccount, sessionKey, loading, error, initSmartAccount, delegateToAgent, reset } =
    useSmartAccount();

  const [step, setStep] = useState<Step>("connect");
  const [localError, setLocalError] = useState<string | null>(null);
  const [config, setConfig] = useState<SubscriptionConfig>({
    compound: 70,
    destination: "",
    destChain: "42161",
  });

  const displayError = localError || error;
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

      const subscriptions = JSON.parse(localStorage.getItem("prismos_subscriptions") || "[]");
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
          className={`h-1 flex-1 transition-colors ${
            i <= currentStepIndex ? "bg-primary" : "bg-muted"
          }`}
        />
      ))}
    </div>
  );

  const renderStepIndicator = () => (
    <div className="text-muted-foreground mb-4 flex items-center justify-center gap-2 font-mono text-[10px] uppercase">
      {STEP_INFO[step].icon}
      <span>
        Step {currentStepIndex + 1} of {STEPS.length}
      </span>
    </div>
  );

  const renderError = () =>
    displayError && (
      <div className="border-destructive/30 bg-destructive/10 mx-6 mb-4 flex items-start gap-3 border p-3">
        <AlertCircle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
        <div className="text-destructive text-sm">{displayError}</div>
      </div>
    );

  const renderConnectStep = () => (
    <div className="space-y-6 text-center">
      {renderStepIndicator()}
      <div className="bg-muted mx-auto flex h-16 w-16 items-center justify-center border">
        <Wallet className="text-muted-foreground h-8 w-8" strokeWidth={1.5} />
      </div>
      <div>
        <h3 className="text-lg font-semibold">Connect Your Wallet</h3>
        <p className="text-muted-foreground mt-2 text-sm">
          Connect your wallet to create a Smart Account and subscribe to this agent.
        </p>
      </div>
      <div className="bg-muted/50 text-muted-foreground border p-4 text-sm">
        Use the <span className="text-foreground font-medium">Connect Wallet</span> button in the
        header to connect.
      </div>
    </div>
  );

  const renderActivateStep = () => (
    <div className="space-y-6">
      {renderStepIndicator()}
      <div className="text-center">
        <div className="bg-muted mx-auto mb-4 flex h-16 w-16 items-center justify-center border">
          <Zap className="text-muted-foreground h-8 w-8" strokeWidth={1.5} />
        </div>
        <h3 className="text-lg font-semibold">Activate Your Account</h3>
        <p className="text-muted-foreground mt-2 text-sm">
          Create a ZeroDev Smart Account (ERC-4337)
        </p>
      </div>

      <div className="space-y-3 border p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="text-success mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="text-sm font-medium">ERC-4337 Smart Account</div>
            <div className="text-muted-foreground text-xs">Powered by ZeroDev Kernel v0.3.1</div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="text-success mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="text-sm font-medium">Counterfactual Deployment</div>
            <div className="text-muted-foreground text-xs">
              Account deployed on first transaction
            </div>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="text-success mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="text-sm font-medium">You Retain Full Control</div>
            <div className="text-muted-foreground text-xs">Revoke agent access anytime</div>
          </div>
        </div>
      </div>

      <div className="border p-4">
        <div className="text-muted-foreground mb-1 font-mono text-[10px] uppercase">
          Connected Wallet (Owner)
        </div>
        <div className="break-all font-mono text-sm">{address}</div>
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
        <h3 className="text-lg font-semibold">Configure Preferences</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          How should the agent manage your yield?
        </p>
      </div>

      {smartAccount && (
        <div className="border-primary/20 bg-primary/5 border p-4">
          <div className="text-muted-foreground mb-1 font-mono text-[10px] uppercase">
            Smart Account Address
          </div>
          <div className="break-all font-mono text-sm">{smartAccount.address}</div>
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-muted-foreground block font-mono text-[10px] uppercase">
          Compound vs Distribute
        </Label>
        <Slider
          value={[config.compound]}
          onValueChange={(values) => setConfig({ ...config, compound: values[0] })}
          min={0}
          max={90}
        />
        <div className="text-muted-foreground flex justify-between text-xs">
          <span>{config.compound}% reinvested</span>
          <span>{90 - config.compound}% distributed</span>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground block font-mono text-[10px] uppercase">
          Destination Address
        </Label>
        <Input
          type="text"
          placeholder="0x... (for yield distribution)"
          value={config.destination}
          onChange={(e) => setConfig({ ...config, destination: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground block font-mono text-[10px] uppercase">
          Destination Chain
        </Label>
        <Select
          value={config.destChain}
          onValueChange={(destChain) => setConfig({ ...config, destChain })}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Risk" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {DESTINATION_CHAINS.map((chain) => (
                <SelectItem key={chain.value} value={chain.value}>
                  {chain.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
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
        <div className="bg-muted mx-auto mb-4 flex h-16 w-16 items-center justify-center border">
          <Shield className="text-muted-foreground h-8 w-8" strokeWidth={1.5} />
        </div>
        <h3 className="text-lg font-semibold">Delegate to Agent</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          Grant limited permissions to {agent.identity.name}
        </p>
      </div>

      <div className="space-y-3 border p-4">
        <div className="text-muted-foreground mb-2 font-mono text-[10px] uppercase">
          Granted Permissions
        </div>
        {agent.permissions.permissions.map((perm) => (
          <div key={perm} className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="text-success h-4 w-4 shrink-0" />
            <span className="font-mono">{perm}</span>
          </div>
        ))}
        <div className="text-destructive flex items-center gap-2 text-sm">
          <X className="h-4 w-4 shrink-0" />
          <span className="font-mono">transfer / burn / withdraw (BLOCKED)</span>
        </div>
      </div>

      <div className="border-success/20 bg-success/5 border p-4">
        <div className="flex items-start gap-3">
          <Shield className="text-success mt-0.5 h-4 w-4 shrink-0" />
          <div className="text-sm">
            <div className="text-success mb-1 font-medium">Safe by Design</div>
            <div className="text-muted-foreground text-xs">
              Session keys are scoped via ZeroDev CallPolicy. The agent can only call specific
              functions on approved contracts.
            </div>
          </div>
        </div>
      </div>

      <div className="border p-4">
        <div className="text-muted-foreground mb-1 font-mono text-[10px] uppercase">
          Agent Wallet
        </div>
        <div className="break-all font-mono text-sm">{agent.identity.wallet}</div>
      </div>

      <div className="border-primary/20 bg-primary/5 border p-4 text-sm">
        <div className="text-muted-foreground mb-2">This transaction will:</div>
        <ul className="text-muted-foreground list-inside list-disc space-y-1 text-xs">
          <li>Deploy your Smart Account on-chain</li>
          <li>Install session key permissions for the agent</li>
        </ul>
        <div className="text-primary mt-2 text-xs">Gas is sponsored by ZeroDev.</div>
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
        <div className="bg-success/10 border-success/20 mx-auto mb-4 flex h-16 w-16 items-center justify-center border">
          <CheckCircle2 className="text-success h-8 w-8" strokeWidth={1.5} />
        </div>
        <h3 className="text-lg font-semibold">You&apos;re Subscribed!</h3>
        <p className="text-muted-foreground mt-2 text-sm">
          <span className="text-foreground font-medium">{agent.identity.name}</span> will now manage
          your LP position.
        </p>
      </div>

      {sessionKey && (
        <div className="space-y-3 border p-4">
          <div className="text-muted-foreground font-mono text-[10px] uppercase">
            Your Smart Account
          </div>
          <div className="break-all font-mono text-sm">{sessionKey.smartAccountAddress}</div>
          {sessionKey.deploymentTxHash && (
            <a
              href={`https://arbiscan.io/tx/${sessionKey.deploymentTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
            >
              View deployment transaction
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      <div className="border-primary/20 bg-primary/5 border p-4">
        <div className="mb-3 text-sm font-medium">Next Steps:</div>
        <ol className="text-muted-foreground list-inside list-decimal space-y-2 text-sm">
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
    <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <Card className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden">
        <CardHeader className="shrink-0 border-b">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg">Subscribe to {agent.identity.name}</CardTitle>
              <div className="mt-2 flex items-center gap-2">
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
