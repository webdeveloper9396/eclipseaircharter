import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Plus, AlertTriangle, Clock, Check, X, Edit2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useOperatorSources,
  useCreateOperatorSource,
  useUpdateOperatorSource,
  useSetOperatorSourceEnabled,
  isEnabledSourceConflict,
} from "@/hooks/useOperatorSources";
import type { OperatorSource, OperatorSourceType } from "@/integrations/external-supabase/types";

const SOURCE_TYPE_LABELS: Record<OperatorSourceType, string> = {
  email: "Email",
  flyeasy: "FlyEasy",
  jetinsight: "JetInsight",
  other_web: "Other Web",
};

interface OperatorSourcesSectionProps {
  operatorId: string;
  operatorName: string;
}

export function OperatorSourcesSection({ operatorId, operatorName }: OperatorSourcesSectionProps) {
  const { toast } = useToast();
  const { data: sources, isLoading } = useOperatorSources(operatorId);
  const createSource = useCreateOperatorSource();
  const updateSource = useUpdateOperatorSource();
  const setEnabled = useSetOperatorSourceEnabled();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingSource, setEditingSource] = useState<OperatorSource | null>(null);

  // Create form state
  const [newSourceType, setNewSourceType] = useState<OperatorSourceType>("email");
  const [newEnabled, setNewEnabled] = useState(false);
  const [newPollInterval, setNewPollInterval] = useState<string>("");
  const [newConfigJson, setNewConfigJson] = useState("");
  const [configError, setConfigError] = useState<string | null>(null);

  // Edit form state
  const [editPollInterval, setEditPollInterval] = useState<string>("");
  const [editConfigJson, setEditConfigJson] = useState("");
  const [editConfigError, setEditConfigError] = useState<string | null>(null);

  // Pending enable toggle state
  const [pendingToggle, setPendingToggle] = useState<{ source: OperatorSource; enabled: boolean } | null>(null);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const validateJson = (json: string): Record<string, unknown> | null => {
    if (!json.trim()) return {};
    try {
      const parsed = JSON.parse(json);
      if (typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  };

  const handleCreateSubmit = () => {
    const config = validateJson(newConfigJson);
    if (config === null) {
      setConfigError("Invalid JSON format. Must be a valid JSON object.");
      return;
    }
    setConfigError(null);

    createSource.mutate(
      {
        p_operator_id: operatorId,
        p_source_type: newSourceType,
        p_enabled: newEnabled,
        p_source_config: Object.keys(config).length > 0 ? config : undefined,
        p_poll_interval_minutes: newPollInterval ? parseInt(newPollInterval, 10) : undefined,
      },
      {
        onSuccess: () => {
          toast({
            title: "Source created",
            description: `Added ${SOURCE_TYPE_LABELS[newSourceType]} source to ${operatorName}.`,
          });
          setShowCreateDialog(false);
          resetCreateForm();
        },
        onError: (err) => {
          if (isEnabledSourceConflict(err)) {
            toast({
              title: "Cannot enable source",
              description: "This operator already has an enabled source. Disable the other source first.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Failed to create source",
              description: err.message,
              variant: "destructive",
            });
          }
        },
      }
    );
  };

  const handleEditSubmit = () => {
    if (!editingSource) return;

    const config = validateJson(editConfigJson);
    if (config === null) {
      setEditConfigError("Invalid JSON format. Must be a valid JSON object.");
      return;
    }
    setEditConfigError(null);

    updateSource.mutate(
      {
        p_source_id: editingSource.id,
        p_source_config: config,
        p_poll_interval_minutes: editPollInterval ? parseInt(editPollInterval, 10) : undefined,
        operator_id: operatorId,
      },
      {
        onSuccess: () => {
          toast({
            title: "Source updated",
            description: `Updated ${SOURCE_TYPE_LABELS[editingSource.source_type]} source configuration.`,
          });
          setEditingSource(null);
        },
        onError: (err) => {
          toast({
            title: "Failed to update source",
            description: err.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleToggleEnabled = (source: OperatorSource, enabled: boolean) => {
    setPendingToggle({ source, enabled });
  };

  const confirmToggleEnabled = () => {
    if (!pendingToggle) return;

    setEnabled.mutate(
      {
        p_operator_source_id: pendingToggle.source.id,
        p_enabled: pendingToggle.enabled,
        operator_id: operatorId,
      },
      {
        onSuccess: () => {
          toast({
            title: pendingToggle.enabled ? "Source enabled" : "Source disabled",
            description: `${SOURCE_TYPE_LABELS[pendingToggle.source.source_type]} source is now ${pendingToggle.enabled ? "enabled" : "disabled"}.`,
          });
          setPendingToggle(null);
        },
        onError: (err) => {
          if (isEnabledSourceConflict(err)) {
            toast({
              title: "Cannot enable source",
              description: "This operator already has an enabled source. Disable the other source first.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Failed to update source",
              description: err.message,
              variant: "destructive",
            });
          }
          setPendingToggle(null);
        },
      }
    );
  };

  const resetCreateForm = () => {
    setNewSourceType("email");
    setNewEnabled(false);
    setNewPollInterval("");
    setNewConfigJson("");
    setConfigError(null);
  };

  const openEditDialog = (source: OperatorSource) => {
    setEditingSource(source);
    setEditPollInterval(source.poll_interval_minutes?.toString() || "");
    setEditConfigJson(source.source_config ? JSON.stringify(source.source_config, null, 2) : "");
    setEditConfigError(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs text-muted-foreground uppercase tracking-wider">
          Ingestion Sources
        </h4>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCreateDialog(true)}
          className="h-7"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Source
        </Button>
      </div>

      {sources && sources.length > 0 ? (
        <div className="space-y-3">
          {sources.map((source) => (
            <div key={source.id} className="bg-secondary rounded-md p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant={source.enabled ? "default" : "secondary"}>
                    {SOURCE_TYPE_LABELS[source.source_type]}
                  </Badge>
                  {source.enabled && (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      <Check className="h-3 w-3 mr-1" />
                      Enabled
                    </Badge>
                  )}
                  {source.failure_streak > 0 && (
                    <Badge variant="destructive" className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {source.failure_streak} failures
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditDialog(source)}
                    className="h-7 px-2"
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  <Switch
                    checked={source.enabled}
                    onCheckedChange={(checked) => handleToggleEnabled(source, checked)}
                    disabled={setEnabled.isPending}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Poll Interval:</span>
                  <span className="ml-2 tabular-nums">
                    {source.poll_interval_minutes ? `${source.poll_interval_minutes} min` : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Polled:</span>
                  <span className="ml-2 tabular-nums">{formatDate(source.last_polled_at)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Success:</span>
                  <span className="ml-2 tabular-nums">{formatDate(source.last_success_at)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Error:</span>
                  <span className="ml-2 tabular-nums">{formatDate(source.last_error_at)}</span>
                </div>
              </div>

              {source.last_error && (
                <div className="bg-destructive/10 rounded p-2">
                  <span className="text-xs text-destructive font-mono break-all">
                    {source.last_error}
                  </span>
                </div>
              )}

              {source.source_config && Object.keys(source.source_config).length > 0 && (
                <details className="text-xs">
                  <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                    Config
                  </summary>
                  <pre className="mt-2 bg-muted p-2 rounded text-[10px] overflow-x-auto">
                    {JSON.stringify(source.source_config, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-secondary rounded-md p-4 text-center">
          <p className="text-sm text-muted-foreground">No sources configured</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add a source to enable ingestion for this operator.
          </p>
        </div>
      )}

      {/* Create Source Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Add Ingestion Source</DialogTitle>
            <DialogDescription>
              Create a new ingestion source for <strong>{operatorName}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Source Type</Label>
              <Select value={newSourceType} onValueChange={(v) => setNewSourceType(v as OperatorSourceType)}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {Object.entries(SOURCE_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <Label>Enable immediately</Label>
              <Switch checked={newEnabled} onCheckedChange={setNewEnabled} />
            </div>

            <div className="space-y-2">
              <Label>Poll Interval (minutes)</Label>
              <Input
                type="number"
                value={newPollInterval}
                onChange={(e) => setNewPollInterval(e.target.value)}
                placeholder="e.g., 60"
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-2">
              <Label>Source Config (JSON)</Label>
              <Textarea
                value={newConfigJson}
                onChange={(e) => {
                  setNewConfigJson(e.target.value);
                  setConfigError(null);
                }}
                placeholder='{"url": "https://...", "apiKey": "..."}'
                className="bg-secondary border-border font-mono text-xs min-h-[100px]"
              />
              {configError && <p className="text-xs text-destructive">{configError}</p>}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateSubmit} disabled={createSource.isPending}>
              {createSource.isPending ? "Creating..." : "Create Source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Source Dialog */}
      <Dialog open={!!editingSource} onOpenChange={() => setEditingSource(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Edit Source Configuration</DialogTitle>
            <DialogDescription>
              Update the configuration for this{" "}
              <strong>{editingSource ? SOURCE_TYPE_LABELS[editingSource.source_type] : ""}</strong> source.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Poll Interval (minutes)</Label>
              <Input
                type="number"
                value={editPollInterval}
                onChange={(e) => setEditPollInterval(e.target.value)}
                placeholder="e.g., 60"
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-2">
              <Label>Source Config (JSON)</Label>
              <Textarea
                value={editConfigJson}
                onChange={(e) => {
                  setEditConfigJson(e.target.value);
                  setEditConfigError(null);
                }}
                placeholder='{"url": "https://...", "apiKey": "..."}'
                className="bg-secondary border-border font-mono text-xs min-h-[100px]"
              />
              {editConfigError && <p className="text-xs text-destructive">{editConfigError}</p>}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditingSource(null)}>
              Cancel
            </Button>
            <Button onClick={handleEditSubmit} disabled={updateSource.isPending}>
              {updateSource.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toggle Enable Confirmation */}
      <Dialog open={!!pendingToggle} onOpenChange={() => setPendingToggle(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>
              {pendingToggle?.enabled ? "Enable" : "Disable"} Source
            </DialogTitle>
            <DialogDescription>
              {pendingToggle?.enabled ? (
                <>
                  You are about to enable the{" "}
                  <strong>{pendingToggle ? SOURCE_TYPE_LABELS[pendingToggle.source.source_type] : ""}</strong> source.
                  <br /><br />
                  <strong>Note:</strong> Only one source can be enabled per operator. If another source is already enabled, this operation will fail.
                </>
              ) : (
                <>
                  You are about to disable the{" "}
                  <strong>{pendingToggle ? SOURCE_TYPE_LABELS[pendingToggle.source.source_type] : ""}</strong> source.
                  <br /><br />
                  Ingestion from this source will stop until it is re-enabled.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPendingToggle(null)}>
              Cancel
            </Button>
            <Button
              variant={pendingToggle?.enabled ? "default" : "destructive"}
              onClick={confirmToggleEnabled}
              disabled={setEnabled.isPending}
            >
              {setEnabled.isPending ? "Updating..." : pendingToggle?.enabled ? "Enable" : "Disable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
