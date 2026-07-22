import { useOperatorSoldPolicy, useOperatorSnapshotState } from "@/hooks/useExternalData";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";

interface SoldDetectionStatusPanelProps {
  operatorId: string;
}

export function SoldDetectionStatusPanel({ operatorId }: SoldDetectionStatusPanelProps) {
  const { data: soldPolicy, isLoading: loadingPolicy, error: policyError } = useOperatorSoldPolicy(operatorId);
  const { data: snapshotState, isLoading: loadingState, error: stateError } = useOperatorSnapshotState(operatorId);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const isLoading = loadingPolicy || loadingState;

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h4 className="text-xs text-muted-foreground uppercase tracking-wider">
        Sold Detection Status
      </h4>

      {/* Sold Policy Section */}
      <div className="bg-secondary rounded-md p-4 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Policy Configuration</span>
          {policyError ? (
            <Badge variant="destructive" className="text-xs">
              <XCircle className="h-3 w-3 mr-1" />
              Error
            </Badge>
          ) : !soldPolicy ? (
            <Badge variant="outline" className="text-xs bg-badge-muted border-border">
              No policy found
            </Badge>
          ) : soldPolicy.enabled ? (
            <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-400">
              <CheckCircle className="h-3 w-3 mr-1" />
              Enabled
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              <XCircle className="h-3 w-3 mr-1" />
              Disabled
            </Badge>
          )}
        </div>

        {policyError ? (
          <p className="text-sm text-destructive">Failed to load policy: {policyError.message}</p>
        ) : !soldPolicy ? (
          <p className="text-sm text-muted-foreground">
            No sold detection policy configured for this operator.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trust Level</span>
              <span className="font-mono">{soldPolicy.snapshot_trust_level ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Min Seen (Hard)</span>
              <span className="font-mono">{soldPolicy.min_seen_hard ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Min Seen (Review Low)</span>
              <span className="font-mono">{soldPolicy.min_seen_review_low ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Min Seen (Review High)</span>
              <span className="font-mono">{soldPolicy.min_seen_review_high ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ratio Threshold</span>
              <span className="font-mono">{soldPolicy.ratio_threshold ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lookback Days</span>
              <span className="font-mono">{soldPolicy.lookback_days ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Max Partial Streak</span>
              <span className="font-mono">{soldPolicy.max_partial_streak ?? "—"}</span>
            </div>
            <div className="flex justify-between col-span-2">
              <span className="text-muted-foreground">Last Updated</span>
              <span className="tabular-nums">{formatDate(soldPolicy.updated_at)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Snapshot State Section */}
      <div className="bg-secondary rounded-md p-4 space-y-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Snapshot State</span>
          {stateError ? (
            <Badge variant="destructive" className="text-xs">
              <XCircle className="h-3 w-3 mr-1" />
              Error
            </Badge>
          ) : !snapshotState ? (
            <Badge variant="outline" className="text-xs bg-badge-muted border-border">
              No state found
            </Badge>
          ) : snapshotState.partial_streak > 0 ? (
            <Badge variant="secondary" className="text-xs bg-yellow-500/20 text-yellow-400">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Partial streak: {snapshotState.partial_streak}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs bg-green-500/20 text-green-400">
              <CheckCircle className="h-3 w-3 mr-1" />
              Healthy
            </Badge>
          )}
        </div>

        {stateError ? (
          <p className="text-sm text-destructive">Failed to load state: {stateError.message}</p>
        ) : !snapshotState ? (
          <p className="text-sm text-muted-foreground">
            No snapshot state tracked for this operator.
          </p>
        ) : (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last Good Snapshot
              </span>
              <span className="tabular-nums">{formatDate(snapshotState.last_good_snapshot_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last Good Seen Count</span>
              <span className="font-mono">{snapshotState.last_good_seen_count ?? "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Partial Streak</span>
              <span className="font-mono">{snapshotState.partial_streak}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">State Updated</span>
              <span className="tabular-nums">{formatDate(snapshotState.updated_at)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
