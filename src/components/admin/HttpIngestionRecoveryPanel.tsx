import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminRpc, adminSelect } from "@/lib/admin-proxy";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { toast } from "sonner";
import { AlertTriangle, Lock, Unlock, RefreshCw } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

interface WorkflowLockRow {
  id: string;
  locked_at: string | null;
}

interface IngestionCursorRow {
  id: string;
  last_operator_source_id: string | null;
  updated_at: string | null;
}

interface OperatorSourceRow {
  id: string;
  operator_id: string;
  source_type: string;
  enabled: boolean;
}

interface OperatorRow {
  id: string;
  name: string | null;
}

const HTTP_SOURCE_TYPES = ["flyeasy", "jetinsight", "other_web"];

export function HttpIngestionRecoveryPanel() {
  const queryClient = useQueryClient();

  const lockQuery = useQuery({
    queryKey: ["external", "workflow_locks", "flyeasy_http_ingestion"],
    queryFn: async () => {
      const { data } = await adminSelect<WorkflowLockRow[]>({
        table: "workflow_locks",
        columns: "id, locked_at",
        filters: [{ col: "id", op: "eq", value: "flyeasy_http_ingestion" }],
        limit: 1,
      });
      return data?.[0] ?? null;
    },
    refetchInterval: 30000,
  });

  const cursorQuery = useQuery({
    queryKey: ["external", "ingestion_cursors", "http_ingestion"],
    queryFn: async () => {
      const { data } = await adminSelect<IngestionCursorRow[]>({
        table: "ingestion_cursors",
        columns: "id, last_operator_source_id, updated_at",
        filters: [{ col: "id", op: "eq", value: "http_ingestion" }],
        limit: 1,
      });
      return data?.[0] ?? null;
    },
    refetchInterval: 30000,
  });

  const sourcesQuery = useQuery({
    queryKey: ["external", "operator_sources", "http_enabled"],
    queryFn: async () => {
      const { data } = await adminSelect<OperatorSourceRow[]>({
        table: "operator_sources",
        columns: "id, operator_id, source_type, enabled",
        filters: [
          { col: "enabled", op: "eq", value: true },
          { col: "source_type", op: "in", value: HTTP_SOURCE_TYPES },
        ],
        order: [{ column: "id", ascending: true }],
      });
      return data ?? [];
    },
  });

  const operatorsQuery = useQuery({
    queryKey: ["external", "operators", "id-name"],
    queryFn: async () => {
      const { data } = await adminSelect<OperatorRow[]>({
        table: "operators",
        columns: "id, name",
      });
      return data ?? [];
    },
  });

  const cursorSourceId = cursorQuery.data?.last_operator_source_id ?? null;
  const cursorSourceQuery = useQuery({
    queryKey: ["external", "operator_sources", "cursor", cursorSourceId],
    enabled: !!cursorSourceId,
    queryFn: async () => {
      const { data } = await adminSelect<OperatorSourceRow[]>({
        table: "operator_sources",
        columns: "id, operator_id, source_type, enabled",
        filters: [{ col: "id", op: "eq", value: cursorSourceId! }],
        limit: 1,
      });
      return data?.[0] ?? null;
    },
  });

  const operatorMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of operatorsQuery.data ?? []) {
      if (o.name) m.set(o.id, o.name);
    }
    return m;
  }, [operatorsQuery.data]);

  const sources = sourcesQuery.data ?? [];
  const cursor = cursorQuery.data;
  const lock = lockQuery.data;

  const currentSource = cursor?.last_operator_source_id
    ? sources.find((s) => s.id === cursor.last_operator_source_id)
      ?? cursorSourceQuery.data
      ?? null
    : null;

  const currentOperatorName = currentSource
    ? operatorMap.get(currentSource.operator_id) ?? null
    : null;

  const nextSource = useMemo(() => {
    if (sources.length === 0) return null;
    if (!cursor?.last_operator_source_id) return sources[0];
    const idx = sources.findIndex((s) => s.id === cursor.last_operator_source_id);
    if (idx === -1) return sources[0];
    return sources[(idx + 1) % sources.length];
  }, [sources, cursor?.last_operator_source_id]);

  const nextOperatorName = nextSource
    ? operatorMap.get(nextSource.operator_id) ?? null
    : null;

  const clearLockMutation = useMutation({
    mutationFn: async () => adminRpc("admin_clear_flyeasy_workflow_lock_v1", {}),
    onSuccess: () => {
      toast.success("FlyEasy workflow lock cleared");
      queryClient.invalidateQueries({ queryKey: ["external", "workflow_locks"] });
    },
    onError: (err: Error) => toast.error(`Failed to clear lock: ${err.message}`),
  });

  const advanceCursorMutation = useMutation({
    mutationFn: async (sourceId: string) =>
      adminRpc("admin_set_http_ingestion_cursor_v1", { p_operator_source_id: sourceId }),
    onSuccess: () => {
      toast.success("Ingestion cursor advanced");
      queryClient.invalidateQueries({ queryKey: ["external", "ingestion_cursors"] });
    },
    onError: (err: Error) => toast.error(`Failed to advance cursor: ${err.message}`),
  });

  const lockedAt = lock?.locked_at ? new Date(lock.locked_at) : null;
  const lockAge = lockedAt ? formatDistanceToNow(lockedAt, { addSuffix: true }) : null;

  const formatSourceLabel = (source: OperatorSourceRow | null) => {
    if (!source) return "—";
    const opName = operatorMap.get(source.operator_id);
    return opName ? `${opName} (${source.source_type})` : `${source.source_type} · ${source.id.slice(0, 8)}…`;
  };

  return (
    <section className="mb-8">
      <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
        <AlertTriangle className="h-3 w-3 text-severity-warn" />
        HTTP Ingestion Recovery
      </h2>
      <p className="text-xs text-muted-foreground mb-3">
        Operational recovery for stale locks / cursors when n8n dies mid-execution. Use with care.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: Lock status */}
        <Card className="bg-tile border-tile-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              {lock ? (
                <Lock className="h-4 w-4 text-severity-warn" />
              ) : (
                <Unlock className="h-4 w-4 text-status-success" />
              )}
              FlyEasy HTTP Workflow Lock
            </CardTitle>
            <CardDescription className="text-xs">
              workflow_locks.id = flyeasy_http_ingestion
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm space-y-1">
              {lockQuery.isLoading ? (
                <div className="text-muted-foreground">Loading…</div>
              ) : lock ? (
                <>
                  <div>
                    <span className="text-muted-foreground">Locked at: </span>
                    <span className="font-mono">
                      {lockedAt ? format(lockedAt, "yyyy-MM-dd HH:mm:ss") : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Age: </span>
                    <span>{lockAge ?? "—"}</span>
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground">No active lock row.</div>
              )}
            </div>
            <div className="flex gap-2">
              <ConfirmDialog
                trigger={
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={clearLockMutation.isPending}
                  >
                    Clear FlyEasy HTTP Lock
                  </Button>
                }
                title="Clear FlyEasy HTTP Workflow Lock?"
                description="This will delete the workflow_locks row for flyeasy_http_ingestion. Only do this if n8n has crashed and the lock is stale. Any active n8n run will be able to re-acquire the lock immediately."
                confirmLabel="Clear lock"
                dangerous
                onConfirm={() => clearLockMutation.mutate()}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => lockQuery.refetch()}
                disabled={lockQuery.isFetching}
              >
                <RefreshCw className={`h-4 w-4 ${lockQuery.isFetching ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Cursor */}
        <Card className="bg-tile border-tile-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Ingestion Cursor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm space-y-1">
              {cursorQuery.isLoading || sourcesQuery.isLoading || operatorsQuery.isLoading ? (
                <div className="text-muted-foreground">Loading…</div>
              ) : cursor ? (
                <>
                  <div>
                    <span className="text-muted-foreground">Last source: </span>
                    <span>
                      {currentSource
                        ? formatSourceLabel(currentSource)
                        : cursor.last_operator_source_id
                          ? `${cursor.last_operator_source_id.slice(0, 8)}… (not in enabled list)`
                          : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Updated: </span>
                    <span className="font-mono">
                      {cursor.updated_at
                        ? format(new Date(cursor.updated_at), "yyyy-MM-dd HH:mm:ss")
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Next on advance: </span>
                    <span>{formatSourceLabel(nextSource)}</span>
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground">No cursor row.</div>
              )}
            </div>

            <div className="flex gap-2">
              <ConfirmDialog
                trigger={
                  <Button
                    size="sm"
                    disabled={!nextSource || advanceCursorMutation.isPending}
                  >
                    Advance cursor by 1
                  </Button>
                }
                title="Advance ingestion cursor?"
                description={
                  nextSource
                    ? `This will set the cursor to ${
                        nextOperatorName ?? nextSource.source_type
                      } (${nextSource.source_type}). The next ingestion run will resume after this source.`
                    : "No enabled HTTP source available."
                }
                confirmLabel="Advance"
                onConfirm={() => nextSource && advanceCursorMutation.mutate(nextSource.id)}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  cursorQuery.refetch();
                  sourcesQuery.refetch();
                }}
                disabled={cursorQuery.isFetching || sourcesQuery.isFetching}
              >
                <RefreshCw
                  className={`h-4 w-4 ${
                    cursorQuery.isFetching || sourcesQuery.isFetching ? "animate-spin" : ""
                  }`}
                />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
