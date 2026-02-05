"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Bot,
  Check,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Globe,
  User,
  Target,
  DollarSign,
  FileCheck,
} from "lucide-react";
import { CHAIN_NAMES, ChainId, RiskLevel, Protocol, AgentPermission } from "@/lib/types";
import { useENS, PRISMOS_DOMAIN, type ParsedAgentData } from "@/hooks";

interface CreateAgentDialogProps {
  trigger?: React.ReactNode;
  onSuccess?: (ensName: string) => void;
}

type Step = "claim" | "identity" | "strategy" | "pricing" | "review";

const STEPS: Step[] = ["claim", "identity", "strategy", "pricing", "review"];

const STEP_CONFIG = {
  claim: { title: "Claim Subdomain", icon: Globe, description: "Choose your agent's ENS name" },
  identity: { title: "Identity", icon: User, description: "Set your agent's profile" },
  strategy: { title: "Strategy", icon: Target, description: "Configure trading strategy" },
  pricing: { title: "Pricing", icon: DollarSign, description: "Set your fees" },
  review: { title: "Review & Publish", icon: FileCheck, description: "Confirm and publish" },
};

const AVAILABLE_PERMISSIONS: AgentPermission[] = [
  "collect",
  "modifyLiquidity",
  "execute",
  "swap",
  "bridge",
  "compound",
];

const PROTOCOLS: { value: Protocol; label: string }[] = [
  { value: "uniswap-v4", label: "Uniswap v4" },
  { value: "uniswap-v3", label: "Uniswap v3" },
  { value: "aerodrome", label: "Aerodrome" },
  { value: "camelot", label: "Camelot" },
];

const initialFormData: Omit<
  ParsedAgentData,
  "strategyId" | "strategyDescription" | "avatar" | "version"
> = {
  name: "",
  description: "",
  wallet: "",
  pool: "",
  chainId: 8453,
  risk: "medium",
  protocol: "uniswap-v4",
  pair: "",
  collectFeePercent: 10,
  rebalanceFeeUsd: 0.1,
  compoundFeePercent: 10,
  rangeAdjustFeeUsd: 0.5,
  permissions: ["collect", "modifyLiquidity", "compound"],
  contracts: [],
};

export function CreateAgentDialog({ trigger, onSuccess }: CreateAgentDialogProps) {
  const { address, isConnected } = useAccount();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("claim");
  const [subdomainInput, setSubdomainInput] = useState("");
  const [claimedSubdomain, setClaimedSubdomain] = useState<string | null>(null);
  const [formData, setFormData] = useState(initialFormData);

  // ENS hook (consolidated)
  const {
    // Subdomain claiming
    checkAvailability,
    claimSubdomain,
    checkCanClaim,
    availability,
    canClaim,
    isCheckingAvailability,
    isClaiming,
    confirmationStatus,
    claimTxHash,
    // Record updating
    updateRecords,
    isUpdating: isPublishing,
    updateTxHash: publishTxHash,
    // Shared
    isLoading: isCheckingPermission,
    error,
    clear,
  } = useENS();

  // Check if user can claim subdomains when dialog opens
  useEffect(() => {
    if (open && isConnected) {
      checkCanClaim();
      // Auto-fill wallet address when dialog opens
      if (address && !formData.wallet) {
        setFormData((prev) => ({ ...prev, wallet: address }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isConnected]);

  const currentStepIndex = STEPS.indexOf(step);
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === STEPS.length - 1;

  const updateField = <K extends keyof typeof formData>(field: K, value: (typeof formData)[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const togglePermission = (perm: AgentPermission) => {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter((p) => p !== perm)
        : [...prev.permissions, perm],
    }));
  };

  const handleCheckAvailability = async () => {
    if (subdomainInput.trim()) {
      await checkAvailability(subdomainInput);
    }
  };

  const handleClaimSubdomain = async () => {
    if (!availability?.isAvailable) return;

    const hash = await claimSubdomain(availability.name);
    if (hash) {
      setClaimedSubdomain(availability.fullName);
      // Move to next step after successful claim
      setTimeout(() => setStep("identity"), 1000);
    }
  };

  const handleUseExistingSubdomain = () => {
    if (!availability?.isOwnedByUser) return;
    setClaimedSubdomain(availability.fullName);
    setStep("identity");
  };

  const handlePublish = async () => {
    if (!claimedSubdomain) return;

    const hash = await updateRecords(claimedSubdomain, {
      ...formData,
      strategyId: `${formData.pair.toLowerCase().replace("/", "-")}-${formData.protocol}`,
    });

    if (hash) {
      onSuccess?.(claimedSubdomain);
    }
  };

  const handleNext = () => {
    // If proceeding from claim step with an owned subdomain, set it
    if (step === "claim" && availability?.isOwnedByUser && !claimedSubdomain) {
      setClaimedSubdomain(availability.fullName);
    }

    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setStep(STEPS[nextIndex]);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setStep(STEPS[prevIndex]);
    }
  };

  const handleClose = () => {
    setOpen(false);
    // Reset after animation
    setTimeout(() => {
      setStep("claim");
      setSubdomainInput("");
      setClaimedSubdomain(null);
      setFormData({ ...initialFormData, wallet: address || "" });
      clear();
    }, 200);
  };

  const canProceed = () => {
    switch (step) {
      case "claim":
        return (
          !!claimedSubdomain ||
          (availability?.isAvailable && canClaim) ||
          availability?.isOwnedByUser
        );
      case "identity":
        return !!formData.name && !!formData.wallet;
      case "strategy":
        return !!formData.pair && !!formData.pool;
      case "pricing":
        return true;
      case "review":
        return true;
      default:
        return false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            List Your Agent
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            {STEP_CONFIG[step].title}
          </DialogTitle>
          <DialogDescription>{STEP_CONFIG[step].description}</DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        <div className="flex items-center justify-between py-4">
          {STEPS.map((s, i) => {
            const Icon = STEP_CONFIG[s].icon;
            const isActive = i === currentStepIndex;
            const isComplete = i < currentStepIndex;
            return (
              <div key={s} className="flex items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : isComplete
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-muted-foreground/30 text-muted-foreground"
                  }`}
                >
                  {isComplete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`mx-2 h-0.5 w-8 ${
                      isComplete ? "bg-primary" : "bg-muted-foreground/30"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="min-h-[300px] py-4">
          {/* STEP 1: Claim Subdomain */}
          {step === "claim" && (
            <div className="space-y-4">
              {!isConnected ? (
                <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900 dark:bg-yellow-950">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    Please connect your wallet to continue.
                  </p>
                </div>
              ) : (
                <>
                  {/* Permission check */}
                  {isCheckingPermission ? (
                    <div className="text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking permissions...
                    </div>
                  ) : !canClaim ? (
                    <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900 dark:bg-yellow-950">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="mt-0.5 h-4 w-4 text-yellow-600" />
                        <div>
                          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                            Subdomain Creation Not Available
                          </p>
                          <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
                            Your wallet is not authorized to create subdomains under{" "}
                            {PRISMOS_DOMAIN}. You can either:
                          </p>
                          <ul className="mt-2 list-inside list-disc text-xs text-yellow-700 dark:text-yellow-300">
                            <li>Contact the PrismOS team to get a subdomain</li>
                            <li>Use your own ENS domain and configure it manually</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : claimedSubdomain ? (
                    <div className="rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="font-medium text-green-800 dark:text-green-200">
                            Subdomain Claimed!
                          </p>
                          <p className="font-mono text-sm text-green-700 dark:text-green-300">
                            {claimedSubdomain}
                          </p>
                        </div>
                      </div>
                      {claimTxHash && (
                        <div className="mt-2 flex items-center justify-between">
                          <a
                            href={`https://etherscan.io/tx/${claimTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-green-600 hover:underline"
                          >
                            View transaction <ExternalLink className="h-3 w-3" />
                          </a>
                          <span className="text-xs text-green-600">
                            {confirmationStatus === "pending" && (
                              <span className="flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Confirming...
                              </span>
                            )}
                            {confirmationStatus === "confirmed" && "✓ Confirmed"}
                            {confirmationStatus === "failed" && (
                              <span className="text-yellow-600">Check on Etherscan</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="subdomain">Choose your agent name</Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              id="subdomain"
                              placeholder="yieldbot"
                              value={subdomainInput}
                              onChange={(e) => {
                                setSubdomainInput(
                                  e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                                );
                                clear();
                              }}
                              onKeyDown={(e) => e.key === "Enter" && handleCheckAvailability()}
                              className="pr-24"
                            />
                            <span className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                              .{PRISMOS_DOMAIN}
                            </span>
                          </div>
                          <Button
                            onClick={handleCheckAvailability}
                            disabled={!subdomainInput || isCheckingAvailability}
                            variant="outline"
                          >
                            {isCheckingAvailability ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Check"
                            )}
                          </Button>
                        </div>
                        <p className="text-muted-foreground text-xs">
                          3-32 characters, lowercase letters, numbers, and hyphens only
                        </p>
                      </div>

                      {/* Availability result */}
                      {availability && (
                        <div
                          className={`rounded-md border p-4 ${
                            availability.isAvailable || availability.isOwnedByUser
                              ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
                              : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {availability.isAvailable || availability.isOwnedByUser ? (
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                              ) : (
                                <AlertCircle className="h-5 w-5 text-red-600" />
                              )}
                              <div>
                                <p className="font-mono text-sm font-medium">
                                  {availability.fullName}
                                </p>
                                <p
                                  className={`text-xs ${
                                    availability.isAvailable || availability.isOwnedByUser
                                      ? "text-green-600 dark:text-green-400"
                                      : "text-red-600 dark:text-red-400"
                                  }`}
                                >
                                  {availability.isAvailable
                                    ? "Available!"
                                    : availability.isOwnedByUser
                                      ? "You own this subdomain"
                                      : `Taken by ${availability.currentOwner?.slice(0, 6)}...${availability.currentOwner?.slice(-4)}`}
                                </p>
                              </div>
                            </div>
                            {availability.isAvailable && (
                              <Button onClick={handleClaimSubdomain} disabled={isClaiming}>
                                {isClaiming ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Claiming...
                                  </>
                                ) : (
                                  "Claim"
                                )}
                              </Button>
                            )}
                            {availability.isOwnedByUser && (
                              <Button onClick={handleUseExistingSubdomain}>
                                Continue Setup
                                <ArrowRight className="ml-2 h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )}

                      {error && step === "claim" && (
                        <div className="overflow-hidden text-ellipsis whitespace-pre-wrap break-all rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                          {error}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* STEP 2: Identity */}
          {step === "identity" && (
            <div className="space-y-4">
              <div className="bg-muted/50 mb-4 rounded-md border p-3">
                <p className="text-muted-foreground text-xs">Configuring</p>
                <p className="font-mono font-medium">{claimedSubdomain}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Agent Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., YieldBot v1"
                  value={formData.name}
                  onChange={(e) => updateField("name", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wallet">Agent Wallet Address *</Label>
                <Input
                  id="wallet"
                  placeholder="0x..."
                  value={formData.wallet}
                  onChange={(e) => updateField("wallet", e.target.value)}
                />
                <p className="text-muted-foreground text-xs">
                  This wallet will execute transactions and receive payments
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Describe what your agent does..."
                  value={formData.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* STEP 3: Strategy */}
          {step === "strategy" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Chain *</Label>
                  <Select
                    value={formData.chainId.toString()}
                    onValueChange={(v) => updateField("chainId", Number(v) as ChainId)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CHAIN_NAMES).map(([id, name]) => (
                        <SelectItem key={id} value={id}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Protocol</Label>
                  <Select
                    value={formData.protocol}
                    onValueChange={(v) => updateField("protocol", v as Protocol)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROTOCOLS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pair">Token Pair *</Label>
                <Input
                  id="pair"
                  placeholder="e.g., WBTC/cbBTC"
                  value={formData.pair}
                  onChange={(e) => updateField("pair", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="pool">Pool Address *</Label>
                <Input
                  id="pool"
                  placeholder="0x..."
                  value={formData.pool}
                  onChange={(e) => updateField("pool", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Risk Level</Label>
                <Select
                  value={formData.risk}
                  onValueChange={(v) => updateField("risk", v as RiskLevel)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low - Stable pairs, minimal IL</SelectItem>
                    <SelectItem value="medium">Medium - Moderate volatility</SelectItem>
                    <SelectItem value="high">High - Volatile pairs, higher returns</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Required Permissions</Label>
                <p className="text-muted-foreground text-xs">
                  Select the permissions your agent needs
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  {AVAILABLE_PERMISSIONS.map((perm) => (
                    <Badge
                      key={perm}
                      variant={formData.permissions.includes(perm) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => togglePermission(perm)}
                    >
                      {perm}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Pricing */}
          {step === "pricing" && (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                Set your fees. Users pay these via x402 micropayments through Yellow Network.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="collectFee">Collect Fee</Label>
                  <div className="relative">
                    <Input
                      id="collectFee"
                      type="number"
                      min={0}
                      max={50}
                      step={0.5}
                      value={formData.collectFeePercent}
                      onChange={(e) =>
                        updateField("collectFeePercent", parseFloat(e.target.value) || 0)
                      }
                    />
                    <span className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                      %
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">% of collected LP fees</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="compoundFee">Compound Fee</Label>
                  <div className="relative">
                    <Input
                      id="compoundFee"
                      type="number"
                      min={0}
                      max={50}
                      step={0.5}
                      value={formData.compoundFeePercent}
                      onChange={(e) =>
                        updateField("compoundFeePercent", parseFloat(e.target.value) || 0)
                      }
                    />
                    <span className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                      %
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">% of compounded amount</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rebalanceFee">Rebalance Fee</Label>
                  <div className="relative">
                    <Input
                      id="rebalanceFee"
                      type="number"
                      min={0}
                      max={10}
                      step={0.01}
                      value={formData.rebalanceFeeUsd}
                      onChange={(e) =>
                        updateField("rebalanceFeeUsd", parseFloat(e.target.value) || 0)
                      }
                    />
                    <span className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                      $
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">Flat fee per rebalance</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="rangeAdjustFee">Range Adjust Fee</Label>
                  <div className="relative">
                    <Input
                      id="rangeAdjustFee"
                      type="number"
                      min={0}
                      max={10}
                      step={0.01}
                      value={formData.rangeAdjustFeeUsd}
                      onChange={(e) =>
                        updateField("rangeAdjustFeeUsd", parseFloat(e.target.value) || 0)
                      }
                    />
                    <span className="text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                      $
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">Flat fee per range adjustment</p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Review */}
          {step === "review" && (
            <div className="space-y-4">
              <div className="rounded-md border p-4">
                <div className="flex items-center gap-3">
                  <div className="bg-muted flex h-12 w-12 items-center justify-center rounded-full border">
                    <Bot className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-semibold">{formData.name}</p>
                    <p className="text-muted-foreground font-mono text-sm">{claimedSubdomain}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Chain</p>
                  <p className="font-medium">{CHAIN_NAMES[formData.chainId]}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Pair</p>
                  <p className="font-medium">{formData.pair}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Protocol</p>
                  <p className="font-medium">{formData.protocol}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Risk</p>
                  <p className="font-medium capitalize">{formData.risk}</p>
                </div>
              </div>

              <div className="rounded-md border p-3">
                <p className="text-muted-foreground mb-2 text-xs font-medium">FEES</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Collect</span>
                    <span>{formData.collectFeePercent}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Compound</span>
                    <span>{formData.compoundFeePercent}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Rebalance</span>
                    <span>${formData.rebalanceFeeUsd.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Range Adjust</span>
                    <span>${formData.rangeAdjustFeeUsd.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-md border p-3">
                <p className="text-muted-foreground mb-2 text-xs font-medium">PERMISSIONS</p>
                <div className="flex flex-wrap gap-1">
                  {formData.permissions.map((perm) => (
                    <Badge key={perm} variant="secondary" className="text-xs">
                      {perm}
                    </Badge>
                  ))}
                </div>
              </div>

              {publishTxHash && (
                <div className="rounded-md border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-800 dark:text-green-200">
                        Agent Published!
                      </p>
                      <a
                        href={`https://etherscan.io/tx/${publishTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-green-600 hover:underline"
                      >
                        View transaction <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {error && step === "review" && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t pt-4">
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>

          <div className="flex gap-2">
            {!isFirstStep && (
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            )}

            {isLastStep ? (
              <Button onClick={handlePublish} disabled={isPublishing || !!publishTxHash}>
                {isPublishing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Publishing...
                  </>
                ) : publishTxHash ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Published
                  </>
                ) : (
                  <>
                    Publish Agent
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Continue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
