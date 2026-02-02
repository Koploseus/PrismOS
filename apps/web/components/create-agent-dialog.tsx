"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Bot,
  Info,
  Coins,
  Shield,
  X,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { CHAIN_NAMES, ChainId, RiskLevel, Protocol, AgentPermission } from "@/lib/types";
import { useENSSubdomains, type ENSSubdomain } from "@/hooks/useENSSubdomains";
import { useENSTextRecords } from "@/hooks/useENSTextRecords";
import { useUpdateENSRecords } from "@/hooks/useUpdateENSRecords";

interface CreateAgentDialogProps {
  onCreateAgent?: (agent: AgentFormData) => void;
  trigger?: React.ReactNode;
}

export interface AgentFormData {
  // ENS
  ensName: string;
  // Identity
  name: string;
  description: string;
  wallet: string;
  // Strategy
  strategyId: string;
  pair: string;
  pool: string;
  chainId: ChainId;
  risk: RiskLevel;
  protocol: Protocol;
  // Fees (in display units - will be converted)
  collectFeePercent: number;
  rebalanceFeeUsd: number;
  compoundFeePercent: number;
  rangeAdjustFeeUsd: number;
  // Permissions
  permissions: AgentPermission[];
  contracts: string[];
}

type Step = "domain" | "subdomain" | "form";

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

const initialFormData: AgentFormData = {
  ensName: "",
  name: "",
  description: "",
  wallet: "",
  strategyId: "",
  pair: "",
  pool: "",
  chainId: 42161,
  risk: "medium",
  protocol: "uniswap-v4",
  collectFeePercent: 10,
  rebalanceFeeUsd: 0.1,
  compoundFeePercent: 10,
  rangeAdjustFeeUsd: 0.5,
  permissions: ["collect", "modifyLiquidity", "compound"],
  contracts: [""],
};

export function CreateAgentDialog({ onCreateAgent, trigger }: CreateAgentDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("domain");
  const [domainInput, setDomainInput] = useState("");
  const [selectedSubdomain, setSelectedSubdomain] = useState<ENSSubdomain | null>(null);
  const [formData, setFormData] = useState<AgentFormData>(initialFormData);
  const [currentTab, setCurrentTab] = useState("identity");

  // ENS hooks
  const {
    domain,
    isLoading: isLoadingSubdomains,
    error: subdomainsError,
    fetchSubdomains,
    clear: clearSubdomains,
  } = useENSSubdomains();

  const {
    validation,
    isLoading: isLoadingRecords,
    fetchTextRecords,
    clear: clearRecords,
  } = useENSTextRecords();

  const {
    executeUpdate,
    isLoading: isUpdating,
    txHash,
    error: updateError,
  } = useUpdateENSRecords();

  const updateField = <K extends keyof AgentFormData>(field: K, value: AgentFormData[K]) => {
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

  const addContract = () => {
    setFormData((prev) => ({
      ...prev,
      contracts: [...prev.contracts, ""],
    }));
  };

  const updateContract = (index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      contracts: prev.contracts.map((c, i) => (i === index ? value : c)),
    }));
  };

  const removeContract = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      contracts: prev.contracts.filter((_, i) => i !== index),
    }));
  };

  const handleSearchDomain = () => {
    if (domainInput.trim()) {
      fetchSubdomains(domainInput);
    }
  };

  const handleSelectSubdomain = async (subdomain: ENSSubdomain) => {
    setSelectedSubdomain(subdomain);
    const records = await fetchTextRecords(subdomain.name);
    if (records)
      setFormData({
        ensName: subdomain.name,
        name: records.name || "",
        description: records.description || "",
        wallet: records.wallet || "",
        strategyId: records.strategyId || "",
        pair: records.pair || "",
        pool: records.pool || "",
        chainId: records.chainId,
        risk: records.risk,
        protocol: records.protocol,
        collectFeePercent: records.collectFeePercent,
        rebalanceFeeUsd: records.rebalanceFeeUsd,
        compoundFeePercent: records.compoundFeePercent,
        rangeAdjustFeeUsd: records.rangeAdjustFeeUsd,
        permissions: records.permissions,
        contracts: records.contracts.length > 0 ? records.contracts : [""],
      });
    setStep("form");
  };

  const handleUpdateENS = async () => {
    if (!selectedSubdomain) return;

    await executeUpdate(selectedSubdomain.name, {
      name: formData.name,
      description: formData.description,
      wallet: formData.wallet,
      strategyId: formData.strategyId,
      pool: formData.pool,
      chainId: formData.chainId,
      risk: formData.risk,
      protocol: formData.protocol,
      pair: formData.pair,
      collectFeePercent: formData.collectFeePercent,
      rebalanceFeeUsd: formData.rebalanceFeeUsd,
      compoundFeePercent: formData.compoundFeePercent,
      rangeAdjustFeeUsd: formData.rangeAdjustFeeUsd,
      permissions: formData.permissions,
      contracts: formData.contracts.filter((c) => c.trim() !== ""),
    });
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.wallet || !formData.pair || !formData.pool) {
      return;
    }
    onCreateAgent?.(formData);
    handleClose();
  };

  const handleClose = () => {
    setOpen(false);
    setStep("domain");
    setDomainInput("");
    setSelectedSubdomain(null);
    setFormData(initialFormData);
    setCurrentTab("identity");
    clearSubdomains();
    clearRecords();
  };

  const handleBack = () => {
    if (step === "form") {
      setStep("subdomain");
      setSelectedSubdomain(null);
      clearRecords();
    } else if (step === "subdomain") {
      setStep("domain");
      clearSubdomains();
    }
  };

  const isValidForm =
    formData.name &&
    formData.wallet &&
    formData.pair &&
    formData.pool &&
    formData.permissions.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Register Agent
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Register New Agent
          </DialogTitle>
          <DialogDescription>
            {step === "domain" && "Enter your ENS domain to discover agent subdomains."}
            {step === "subdomain" && "Select an agent subdomain to register."}
            {step === "form" && "Review and complete the agent configuration."}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Enter Domain */}
        {step === "domain" && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="domain">ENS Domain</Label>
              <div className="flex gap-2">
                <Input
                  id="domain"
                  placeholder="myagents.eth"
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearchDomain()}
                />
                <Button onClick={handleSearchDomain} disabled={isLoadingSubdomains}>
                  {isLoadingSubdomains ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Enter the parent domain that contains your agent subdomains
              </p>
            </div>

            {subdomainsError && (
              <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                {subdomainsError}
              </div>
            )}

            {domain && domain.subdomains.length > 0 && (
              <div className="space-y-2">
                <Label>Found {domain.subdomains.length} subdomain(s)</Label>
                <Button variant="outline" className="w-full" onClick={() => setStep("subdomain")}>
                  View Subdomains
                </Button>
              </div>
            )}

            {domain && domain.subdomains.length === 0 && (
              <div className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
                No subdomains found for {domain.name}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Select Subdomain */}
        {step === "subdomain" && domain && (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <Label>Subdomains of {domain.name}</Label>
              <Button variant="ghost" size="sm" onClick={handleBack}>
                Change Domain
              </Button>
            </div>

            <div className="max-h-[300px] space-y-2 overflow-y-auto">
              {domain.subdomains.map((subdomain) => (
                <button
                  key={subdomain.name}
                  className="hover:bg-muted flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors"
                  onClick={() => handleSelectSubdomain(subdomain)}
                >
                  <div>
                    <p className="font-mono text-sm font-medium">{subdomain.name}</p>
                    <p className="text-muted-foreground text-xs">
                      {subdomain.availableTextKeys.length > 0
                        ? `${subdomain.availableTextKeys.length} text records`
                        : "No text records"}
                    </p>
                  </div>
                  {subdomain.availableTextKeys.length > 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="text-muted-foreground h-4 w-4" />
                  )}
                </button>
              ))}
            </div>

            {isLoadingRecords && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
          </div>
        )}

        {/* Step 3: Form */}
        {step === "form" && (
          <>
            {/* Validation Banner */}
            {validation && !validation.isValid && (
              <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900 dark:bg-yellow-950">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                      Missing ENS Text Records
                    </p>
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      The following fields need to be set in ENS:
                    </p>
                    <ul className="mt-1 list-inside list-disc text-xs text-yellow-700 dark:text-yellow-300">
                      {validation.missingFields.map((field) => (
                        <li key={field}>{field}</li>
                      ))}
                    </ul>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={handleUpdateENS}
                      disabled={isUpdating}
                    >
                      {isUpdating ? (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      ) : (
                        <ExternalLink className="mr-2 h-3 w-3" />
                      )}
                      Update ENS Records
                    </Button>
                    {txHash && (
                      <p className="mt-2 font-mono text-xs text-green-600">
                        Tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}
                      </p>
                    )}
                    {updateError && <p className="mt-2 text-xs text-red-600">{updateError}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* ENS Name Display */}
            <div className="mb-4 flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-muted-foreground text-xs">Registering</p>
                <p className="font-mono font-medium">{selectedSubdomain?.name}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={handleBack}>
                Change
              </Button>
            </div>

            <Tabs value={currentTab} onValueChange={setCurrentTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="identity" className="text-xs">
                  <Info className="mr-1 h-3 w-3" />
                  Identity
                </TabsTrigger>
                <TabsTrigger value="strategy" className="text-xs">
                  <Bot className="mr-1 h-3 w-3" />
                  Strategy
                </TabsTrigger>
                <TabsTrigger value="fees" className="text-xs">
                  <Coins className="mr-1 h-3 w-3" />
                  Fees
                </TabsTrigger>
                <TabsTrigger value="permissions" className="text-xs">
                  <Shield className="mr-1 h-3 w-3" />
                  Permissions
                </TabsTrigger>
              </TabsList>

              {/* Identity Tab */}
              <TabsContent value="identity" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Agent Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., YieldBot v2"
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
                    The wallet that will execute actions on behalf of users
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe what your agent does, its strategy, and target users..."
                    value={formData.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    rows={4}
                  />
                </div>
              </TabsContent>

              {/* Strategy Tab */}
              <TabsContent value="strategy" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pair">Token Pair *</Label>
                    <Input
                      id="pair"
                      placeholder="e.g., ETH/wstETH"
                      value={formData.pair}
                      onChange={(e) => updateField("pair", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="strategyId">Strategy ID</Label>
                    <Input
                      id="strategyId"
                      placeholder="e.g., eth-wsteth-lp-v4"
                      value={formData.strategyId}
                      onChange={(e) => updateField("strategyId", e.target.value)}
                    />
                  </div>
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
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Chain</Label>
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
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              {/* Fees Tab */}
              <TabsContent value="fees" className="space-y-4 pt-4">
                <p className="text-muted-foreground text-sm">
                  Set your fees. Users pay these via x402 micropayments through Yellow Network.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="collectFee">Collect Fee (%)</Label>
                    <div className="relative">
                      <Input
                        id="collectFee"
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
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
                    <Label htmlFor="compoundFee">Compound Fee (%)</Label>
                    <div className="relative">
                      <Input
                        id="compoundFee"
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
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
                    <Label htmlFor="rebalanceFee">Rebalance Fee ($)</Label>
                    <div className="relative">
                      <Input
                        id="rebalanceFee"
                        type="number"
                        min={0}
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
                    <Label htmlFor="rangeAdjustFee">Range Adjust Fee ($)</Label>
                    <div className="relative">
                      <Input
                        id="rangeAdjustFee"
                        type="number"
                        min={0}
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
              </TabsContent>

              {/* Permissions Tab */}
              <TabsContent value="permissions" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Required Permissions *</Label>
                  <p className="text-muted-foreground text-xs">
                    Select the permissions your agent needs to operate
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
                <div className="space-y-2">
                  <Label>Allowed Contracts</Label>
                  <p className="text-muted-foreground text-xs">
                    Contract addresses your agent will interact with
                  </p>
                  <div className="space-y-2 pt-2">
                    {formData.contracts.map((contract, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          placeholder="0x..."
                          value={contract}
                          onChange={(e) => updateContract(index, e.target.value)}
                        />
                        {formData.contracts.length > 1 && (
                          <Button variant="ghost" size="icon" onClick={() => removeContract(index)}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={addContract}>
                      <Plus className="mr-1 h-3 w-3" />
                      Add Contract
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}

        <DialogFooter className="mt-6">
          {step !== "domain" && (
            <Button variant="outline" onClick={handleBack}>
              Back
            </Button>
          )}
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {step === "form" && (
            <Button onClick={handleSubmit} disabled={!isValidForm}>
              Register Agent
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
