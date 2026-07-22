import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable } from "@/components/dashboard/DataTable";
import { StatusIndicator } from "@/components/dashboard/StatusIndicator";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { useOperators, useOperatorAliases } from "@/hooks/useExternalData";
import { useOperatorsEnabledSources } from "@/hooks/useOperatorSources";
import { useOperatorSetInventoryMode, useOperatorSetVerified, useOperatorUpdate, useOperatorAliasAdd, useOperatorAliasRemove } from "@/hooks/useExternalMutations";
import type { Operator, InventoryMode, OperatorSourceType } from "@/integrations/external-supabase/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, AlertTriangle, Zap, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { OperatorSourcesSection } from "@/components/operators/OperatorSourcesSection";
import { CreateOperatorDialog } from "@/components/operators/CreateOperatorDialog";
import { SoldDetectionStatusPanel } from "@/components/operators/SoldDetectionStatusPanel";

const SOURCE_TYPE_LABELS: Record<OperatorSourceType, string> = {
  email: "Email",
  flyeasy: "FlyEasy",
  jetinsight: "JetInsight",
  other_web: "Other Web",
};

const INVENTORY_MODE_LABELS: Record<InventoryMode, string> = {
  unclassified: "Unclassified",
  snapshot: "Snapshot",
  trusted_small_snapshot: "Trusted (small snapshots)",
  drop: "Drop",
};

export default function Operators() {
  const [modeFilter, setModeFilter] = useState<string>("all");
  const [verifiedFilter, setVerifiedFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOperator, setSelectedOperator] = useState<Operator | null>(null);
  const [newAlias, setNewAlias] = useState("");
  const [pendingMode, setPendingMode] = useState<InventoryMode | null>(null);
  const [showModeConfirm, setShowModeConfirm] = useState(false);
  const [pendingVerified, setPendingVerified] = useState<boolean | null>(null);
  const [showVerifiedConfirm, setShowVerifiedConfirm] = useState(false);
  const [editingEmail, setEditingEmail] = useState("");
  const [editingCurrency, setEditingCurrency] = useState("");
  const { toast } = useToast();

  const { data: operators, isLoading, error } = useOperators();
  const { data: enabledSources } = useOperatorsEnabledSources();
  const { data: aliases } = useOperatorAliases(selectedOperator?.id);
  const setInventoryMode = useOperatorSetInventoryMode();
  const setVerified = useOperatorSetVerified();
  const updateOperator = useOperatorUpdate();
  const addAlias = useOperatorAliasAdd();
  const removeAlias = useOperatorAliasRemove();

  // Build a map of operator_id -> enabled source info
  const enabledSourceMap = new Map(
    enabledSources?.map((s) => [s.operator_id, s]) || []
  );

  const filteredOperators = (operators || []).filter((op) => {
    if (modeFilter !== "all" && op.inventory_mode !== modeFilter) return false;
    if (verifiedFilter === "verified" && !op.verified) return false;
    if (verifiedFilter === "unverified" && op.verified) return false;
    if (searchQuery && !op.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const columns = [
    {
      key: "name",
      header: "Operator",
      render: (op: Operator) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{op.name}</span>
          {!op.verified && (
            <Badge variant="outline" className="text-xs bg-badge-muted border-border">
              Unverified
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "source",
      header: "Source",
      render: (op: Operator) => {
        const source = enabledSourceMap.get(op.id);
        if (!source) {
          return <span className="text-xs text-muted-foreground">No enabled source</span>;
        }
        return (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              <Zap className="h-3 w-3 mr-1" />
              {SOURCE_TYPE_LABELS[source.source_type]}
            </Badge>
            {source.failure_streak > 0 && (
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" />
                {source.failure_streak}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: "inventory_mode",
      header: "Inventory Mode",
      render: (op: Operator) => (
        <span className="font-mono text-sm text-muted-foreground">
          {INVENTORY_MODE_LABELS[op.inventory_mode] || op.inventory_mode}
        </span>
      ),
    },
    {
      key: "verified",
      header: "Verified",
      render: (op: Operator) => (
        <StatusIndicator
          status={op.verified ? "active" : "pending"}
          label={op.verified ? "Yes" : "No"}
        />
      ),
      className: "w-24",
    },
    {
      key: "updated_at",
      header: "Last Updated",
      render: (op: Operator) => (
        <span className="text-muted-foreground tabular-nums">
          {formatDate(op.updated_at)}
        </span>
      ),
      className: "w-36",
    },
  ];

  const handleAddAlias = () => {
    if (!newAlias.trim() || !selectedOperator) return;
    
    addAlias.mutate(
      { p_operator_id: selectedOperator.id, p_alias: newAlias.trim() },
      {
        onSuccess: () => {
          toast({
            title: "Alias added",
            description: `Added "${newAlias}" to ${selectedOperator.name}.`,
          });
          setNewAlias("");
        },
        onError: (err) => {
          // Check for uniqueness conflict
          const message = err.message.toLowerCase();
          if (message.includes('unique') || message.includes('duplicate') || message.includes('already exists')) {
            toast({
              title: "Alias already exists",
              description: `The alias "${newAlias}" is already in use.`,
              variant: "destructive",
            });
          } else {
            toast({
              title: "Failed to add alias",
              description: err.message,
              variant: "destructive",
            });
          }
        },
      }
    );
  };

  const handleRemoveAlias = (aliasId: string, aliasText: string) => {
    if (!selectedOperator) return;
    
    removeAlias.mutate(
      { p_operator_alias_id: aliasId, operator_id: selectedOperator.id },
      {
        onSuccess: () => {
          toast({
            title: "Alias removed",
            description: `Removed "${aliasText}" from ${selectedOperator.name}.`,
          });
        },
        onError: (err) => {
          toast({
            title: "Failed to remove alias",
            description: err.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleSaveEmail = () => {
    if (!selectedOperator) return;
    const emailToSave = editingEmail.trim() || null;
    updateOperator.mutate(
      { id: selectedOperator.id, email_addresses: emailToSave ? [emailToSave] : [] },
      {
        onSuccess: () => {
          toast({ title: "Email updated", description: `Operator email saved.` });
          setSelectedOperator({ ...selectedOperator, email_addresses: emailToSave ? [emailToSave] : [] });
        },
        onError: (err) => {
          toast({ title: "Failed to update email", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const handleSaveCurrency = () => {
    if (!selectedOperator) return;
    const currencyToSave = editingCurrency.trim().toUpperCase() || null;
    updateOperator.mutate(
      { id: selectedOperator.id, default_currency: currencyToSave },
      {
        onSuccess: () => {
          toast({ title: "Currency updated", description: `Default currency saved.` });
          setSelectedOperator({ ...selectedOperator, default_currency: currencyToSave });
        },
        onError: (err) => {
          toast({ title: "Failed to update currency", description: err.message, variant: "destructive" });
        },
      }
    );
  };

  const handleVerifiedToggle = (checked: boolean) => {
    setPendingVerified(checked);
    setShowVerifiedConfirm(true);
  };

  const handleConfirmVerified = () => {
    if (selectedOperator && pendingVerified !== null) {
      setVerified.mutate(
        { p_operator_id: selectedOperator.id, p_verified: pendingVerified },
        {
          onSuccess: () => {
            toast({
              title: "Verification status updated",
              description: `${selectedOperator.name} is now ${pendingVerified ? "verified" : "unverified"}.`,
            });
            setSelectedOperator({ ...selectedOperator, verified: pendingVerified });
            setShowVerifiedConfirm(false);
            setPendingVerified(null);
          },
          onError: (err) => {
            toast({
              title: "Failed to update",
              description: err.message,
              variant: "destructive",
            });
          },
        }
      );
    }
  };

  if (error) {
    return (
      <DashboardLayout>
        <PageHeader title="Operators" description="Error loading operators" />
        <div className="bg-destructive/10 border border-destructive rounded-md p-4">
          <p className="text-destructive">Failed to load operators: {error.message}</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Operators"
        description="Manage operator configurations and inventory behavior"
        badge={
          <Badge variant="secondary" className="text-xs tabular-nums">
            {isLoading ? "..." : operators?.length ?? 0} total
          </Badge>
        }
      />

      <FilterBar>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search operators..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 w-[200px] bg-secondary border-border"
          />
        </div>

        <Select value={modeFilter} onValueChange={setModeFilter}>
          <SelectTrigger className="w-[160px] bg-secondary border-border">
            <SelectValue placeholder="Inventory Mode" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">All Modes</SelectItem>
            <SelectItem value="unclassified">Unclassified</SelectItem>
            <SelectItem value="snapshot">Snapshot</SelectItem>
            <SelectItem value="trusted_small_snapshot">Trusted (small)</SelectItem>
            <SelectItem value="drop">Drop</SelectItem>
          </SelectContent>
        </Select>

        <Select value={verifiedFilter} onValueChange={setVerifiedFilter}>
          <SelectTrigger className="w-[140px] bg-secondary border-border">
            <SelectValue placeholder="Verified" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="verified">Verified</SelectItem>
            <SelectItem value="unverified">Unverified</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <CreateOperatorDialog
            onCreated={(operatorId) => {
              // Find the newly created operator and open its detail sheet
              const newOp = operators?.find((op) => op.id === operatorId);
              if (newOp) {
                setSelectedOperator(newOp);
                setEditingEmail(newOp.email_addresses?.[0] || "");
                setEditingCurrency(newOp.default_currency || "");
              }
            }}
          />
        </div>
      </FilterBar>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <DataTable<Operator>
          columns={columns}
          data={filteredOperators}
          keyExtractor={(op) => op.id}
          onRowClick={(op) => {
            setSelectedOperator(op);
            setEditingEmail(op.email_addresses?.[0] || "");
            setEditingCurrency(op.default_currency || "");
          }}
          emptyMessage="No operators found"
        />
      )}

      {/* Operator Detail Sheet */}
      <Sheet open={!!selectedOperator} onOpenChange={(open) => {
        if (!open) {
          setSelectedOperator(null);
        } else if (selectedOperator) {
          setEditingEmail(selectedOperator.email_addresses?.[0] || "");
          setEditingCurrency(selectedOperator.default_currency || "");
        }
      }}>
        <SheetContent className="w-[500px] bg-card border-border overflow-y-auto">
          {selectedOperator && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  {selectedOperator.name}
                  {!selectedOperator.verified && (
                    <Badge variant="outline" className="text-xs bg-badge-muted border-border">
                      Unverified
                    </Badge>
                  )}
                </SheetTitle>
              </SheetHeader>

              <Tabs defaultValue="overview" className="mt-6">
                <TabsList className="bg-secondary border-border w-full justify-start">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="sources">Sources</TabsTrigger>
                  <TabsTrigger value="aliases">Aliases</TabsTrigger>
                  <TabsTrigger value="behavior">Behavior</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="mt-4 space-y-4">
                  <div className="bg-secondary rounded-md p-4 space-y-3">
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Inventory Mode</span>
                      <span className="font-mono text-sm">{INVENTORY_MODE_LABELS[selectedOperator.inventory_mode] || selectedOperator.inventory_mode}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">Verified</span>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={selectedOperator.verified}
                          onCheckedChange={handleVerifiedToggle}
                          disabled={setVerified.isPending}
                        />
                        <Label className="text-sm text-muted-foreground">
                          {selectedOperator.verified ? "Yes" : "No"}
                        </Label>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Last Updated</span>
                      <span className="tabular-nums">{formatDate(selectedOperator.updated_at)}</span>
                    </div>
                  </div>

                  <div className="bg-secondary rounded-md p-4 space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Email Address</Label>
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          placeholder="operator@example.com"
                          value={editingEmail}
                          onChange={(e) => setEditingEmail(e.target.value)}
                          className="bg-background border-border flex-1"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleSaveEmail}
                          disabled={updateOperator.isPending || editingEmail === (selectedOperator.email_addresses?.[0] || "")}
                          className="bg-background border-border"
                        >
                          Save
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Default Currency</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="USD"
                          value={editingCurrency}
                          onChange={(e) => setEditingCurrency(e.target.value.toUpperCase())}
                          className="bg-background border-border w-24 font-mono uppercase"
                          maxLength={3}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleSaveCurrency}
                          disabled={updateOperator.isPending || editingCurrency === (selectedOperator.default_currency || "")}
                          className="bg-background border-border"
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  </div>

                  {selectedOperator.notes && (
                    <div className="bg-secondary rounded-md p-4">
                      <span className="text-xs text-muted-foreground block mb-1">Notes</span>
                      <p className="text-sm">{selectedOperator.notes}</p>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="sources" className="mt-4">
                  <OperatorSourcesSection
                    operatorId={selectedOperator.id}
                    operatorName={selectedOperator.name}
                  />
                </TabsContent>

                <TabsContent value="aliases" className="mt-4 space-y-4">
                  <div className="bg-secondary rounded-md p-4">
                    <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                      Current Aliases
                    </h4>
                    <div className="space-y-2">
                      {aliases && aliases.length > 0 ? (
                        aliases.map((alias) => (
                          <div key={alias.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                            <span className="font-mono text-sm">{alias.alias}</span>
                            <ConfirmDialog
                              trigger={
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                  disabled={removeAlias.isPending}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              }
                              title="Remove Alias"
                              description={`This will remove the alias "${alias.alias}" from this operator.`}
                              confirmLabel="Remove"
                              dangerous
                              onConfirm={() => handleRemoveAlias(alias.id, alias.alias)}
                            />
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No aliases configured</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Input
                      placeholder="Add new alias..."
                      value={newAlias}
                      onChange={(e) => setNewAlias(e.target.value)}
                      className="bg-secondary border-border"
                    />
                    <Button 
                      onClick={handleAddAlias} 
                      variant="outline" 
                      className="bg-secondary border-border"
                      disabled={addAlias.isPending || !newAlias.trim()}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="behavior" className="mt-4 space-y-6">
                  <div className="bg-secondary rounded-md p-4">
                    <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                      Inventory Mode
                    </h4>
                    <p className="text-sm text-muted-foreground mb-4">
                      Changing inventory mode affects how the system processes this operator's emails.
                    </p>
                    <Select
                      value={selectedOperator.inventory_mode}
                      onValueChange={(value: InventoryMode) => {
                        if (value !== selectedOperator.inventory_mode) {
                          setPendingMode(value);
                          setShowModeConfirm(true);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full bg-background border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {(Object.entries(INVENTORY_MODE_LABELS) as [InventoryMode, string][]).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Sold Detection Status Panel */}
                  <SoldDetectionStatusPanel operatorId={selectedOperator.id} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Inventory Mode Change Confirmation */}
      <Dialog open={showModeConfirm} onOpenChange={setShowModeConfirm}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Confirm Inventory Mode Change</DialogTitle>
            <DialogDescription>
              You are about to change the inventory mode for <strong>{selectedOperator?.name}</strong> from{" "}
              <strong>{selectedOperator ? INVENTORY_MODE_LABELS[selectedOperator.inventory_mode] : ""}</strong> to{" "}
              <strong>{pendingMode ? INVENTORY_MODE_LABELS[pendingMode] : ""}</strong>.
              <br /><br />
              This will affect how the system interprets and processes inventory updates from this operator. All future emails will be processed according to the new mode. This action will be logged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowModeConfirm(false);
                setPendingMode(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={setInventoryMode.isPending}
              onClick={() => {
                if (selectedOperator && pendingMode) {
                  setInventoryMode.mutate(
                    { p_operator_id: selectedOperator.id, p_inventory_mode: pendingMode },
                    {
                      onSuccess: () => {
                        toast({
                          title: "Inventory mode updated",
                          description: `${selectedOperator.name} is now set to ${INVENTORY_MODE_LABELS[pendingMode]}.`,
                        });
                        setSelectedOperator({ ...selectedOperator, inventory_mode: pendingMode });
                        setShowModeConfirm(false);
                        setPendingMode(null);
                      },
                      onError: (err) => {
                        toast({
                          title: "Failed to update",
                          description: err.message,
                          variant: "destructive",
                        });
                      },
                    }
                  );
                }
              }}
            >
              {setInventoryMode.isPending ? "Saving..." : "Confirm Change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verified Status Change Confirmation */}
      <Dialog open={showVerifiedConfirm} onOpenChange={setShowVerifiedConfirm}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Confirm Verification Status Change</DialogTitle>
            <DialogDescription>
              You are about to mark <strong>{selectedOperator?.name}</strong> as{" "}
              <strong>{pendingVerified ? "Verified" : "Unverified"}</strong>.
              <br /><br />
              This action will be logged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowVerifiedConfirm(false);
                setPendingVerified(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={setVerified.isPending}
              onClick={handleConfirmVerified}
            >
              {setVerified.isPending ? "Saving..." : "Confirm Change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
