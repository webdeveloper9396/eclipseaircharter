import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { MetricTile } from "@/components/dashboard/MetricTile";
import {
  useInventoryRunsCount,
  useDistinctOperatorsCount,
  useLegsIngestedCount,
  useLegsSoldCount,
  useUnclassifiedOperatorsCount,
  usePendingActionableEventsCount,
  useErrorsCount,
  useActiveEmptyLegsCount,
  useActiveOperatorsCount,
  useActiveAircraftTypesCount,
  useActiveInventoryByCategory,
} from "@/hooks/useExternalData";
import { useWorkflowLocks, useHasActiveWorkflowLock } from "@/hooks/useWorkflowLocks";
import { Activity, Package, AlertTriangle, Clock, Plane, Lock, Unlock } from "lucide-react";
import { format } from "date-fns";
import { AdminOnly } from "@/components/auth/RequireRole";
import { HttpIngestionRecoveryPanel } from "@/components/admin/HttpIngestionRecoveryPanel";

export default function Overview() {
  // Activity metrics
  const { data: inventoryRuns24h, isLoading: loadingRuns24h } = useInventoryRunsCount(24);
  const { data: inventoryRuns48h, isLoading: loadingRuns48h } = useInventoryRunsCount(48);
  const { data: distinctOperators24h, isLoading: loadingOperators } = useDistinctOperatorsCount(24);

  // Ingestion metrics
  const { data: legsIngested24h, isLoading: loadingLegs24h } = useLegsIngestedCount(1);
  const { data: legsIngested7d, isLoading: loadingLegs7d } = useLegsIngestedCount(7);
  const { data: legsSold, isLoading: loadingSold } = useLegsSoldCount(7);

  // Attention metrics
  const { data: unclassifiedOperators, isLoading: loadingUnclassified } = useUnclassifiedOperatorsCount();
  const { data: pendingEvents, isLoading: loadingPending } = usePendingActionableEventsCount();
  const { data: errors24h, isLoading: loadingErrors } = useErrorsCount(24);

  // Active inventory metrics
  const { data: activeLegs, isLoading: loadingActiveLegs } = useActiveEmptyLegsCount();
  const { data: activeOperators, isLoading: loadingActiveOperators } = useActiveOperatorsCount();
  const { data: activeAircraftTypes, isLoading: loadingActiveTypes } = useActiveAircraftTypesCount();
  const { data: categoryBreakdown, isLoading: loadingCategories } = useActiveInventoryByCategory();

  const formatValue = (value: number | undefined, loading: boolean) => {
    if (loading) return "—";
    return value ?? 0;
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Overview"
        description="System health and operational status at a glance"
      />

      {/* Activity Section */}
      <section className="mb-8">
        <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Clock className="h-3 w-3" />
          Activity
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricTile
            label="Inventory Runs"
            value={formatValue(inventoryRuns24h, loadingRuns24h)}
            sublabel="Last 24 hours"
          />
          <MetricTile
            label="Inventory Runs"
            value={formatValue(inventoryRuns48h, loadingRuns48h)}
            sublabel="Last 48 hours"
          />
          <MetricTile
            label="Distinct Operators"
            value={formatValue(distinctOperators24h, loadingOperators)}
            sublabel="Last 24 hours"
          />
        </div>
      </section>

      {/* Ingestion Section */}
      <section className="mb-8">
        <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Package className="h-3 w-3" />
          Ingestion
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricTile
            label="New Legs Seen"
            value={formatValue(legsIngested24h, loadingLegs24h)}
            sublabel="Last 24 hours"
          />
          <MetricTile
            label="New Legs Seen"
            value={formatValue(legsIngested7d, loadingLegs7d)}
            sublabel="Last 7 days"
          />
          <MetricTile
            label="Legs Marked Sold"
            value={formatValue(legsSold, loadingSold)}
            sublabel="Last 7 days"
          />
        </div>
      </section>

      {/* Active Inventory Section */}
      <section className="mb-8">
        <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <Plane className="h-3 w-3" />
          Active Inventory
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricTile
            label="Active Empty Legs"
            value={formatValue(activeLegs, loadingActiveLegs)}
          />
          <MetricTile
            label="Active Operators"
            value={formatValue(activeOperators, loadingActiveOperators)}
          />
          <MetricTile
            label="Aircraft Types"
            value={formatValue(activeAircraftTypes, loadingActiveTypes)}
          />
        </div>
      </section>

      {/* Attention Section */}
      <section className="mb-8">
        <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
          <AlertTriangle className="h-3 w-3 text-accent" />
          Requires Attention
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <MetricTile
            label="Unclassified Operators"
            value={formatValue(unclassifiedOperators, loadingUnclassified)}
            attention={(unclassifiedOperators ?? 0) > 0}
          />
          <MetricTile
            label="Pending Events"
            value={formatValue(pendingEvents, loadingPending)}
            sublabel="Requires review"
            attention={(pendingEvents ?? 0) > 0}
          />
          <MetricTile
            label="Errors"
            value={formatValue(errors24h, loadingErrors)}
            sublabel="Last 24 hours"
            attention={(errors24h ?? 0) > 0}
          />
        </div>
      </section>

      {/* Workflow Lock Status */}
      <WorkflowLockSection />

      {/* HTTP Ingestion Recovery (admin-only) */}
      <AdminOnly>
        <HttpIngestionRecoveryPanel />
      </AdminOnly>



      {/* System Status */}
      <SystemStatusSection />
    </DashboardLayout>
  );
}

function WorkflowLockSection() {
  const { data: locks, isLoading } = useWorkflowLocks();

  return (
    <section className="mb-8">
      <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
        <Lock className="h-3 w-3" />
        Workflow Locks
      </h2>
      <div className="bg-tile border border-tile-border rounded-md divide-y divide-tile-border">
        {isLoading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading...</div>
        ) : (
          locks?.map((lock) => (
            <div key={lock.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {lock.isLocked ? (
                  <Lock className="h-4 w-4 text-severity-warn" />
                ) : (
                  <Unlock className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-sm font-medium">{lock.displayName}</span>
              </div>
              <div className="flex items-center gap-3">
                {lock.isLocked ? (
                  <>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider bg-severity-warn/20 text-severity-warn">
                      Locked
                    </span>
                    {lock.lockedAt && (
                      <span className="text-xs text-muted-foreground">
                        since {format(new Date(lock.lockedAt), "HH:mm:ss")}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider bg-status-success/20 text-status-success">
                    Unlocked
                  </span>
                )}
              </div>
            </div>
          ))
        )}
        <div className="px-4 py-2 bg-muted/30">
          <p className="text-xs text-muted-foreground">
            Locks automatically expire after 15 minutes if a workflow crashes.
          </p>
        </div>
      </div>
    </section>
  );
}

function SystemStatusSection() {
  const hasActiveLock = useHasActiveWorkflowLock();
  const { data: errors24h } = useErrorsCount(24);
  const hasErrors = (errors24h ?? 0) > 0;

  const isHealthy = !hasActiveLock && !hasErrors;

  return (
    <section>
      <div className="bg-tile border border-tile-border rounded-md p-4">
        <div className="flex items-center gap-3">
          <span
            className={`w-2 h-2 rounded-full ${
              isHealthy ? "bg-status-success" : "bg-severity-warn"
            }`}
          />
          <span className="text-sm text-muted-foreground">
            {isHealthy
              ? "All systems operational"
              : hasActiveLock
              ? "Workflow lock active"
              : "System has errors"}
          </span>
        </div>
      </div>
    </section>
  );
}
