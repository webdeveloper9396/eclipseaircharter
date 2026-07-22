import { useQuery } from "@tanstack/react-query";
import { adminSelect } from "@/lib/admin-proxy";

export interface WorkflowLock {
  id: string;
  locked_at: string;
}

export interface WorkflowLockStatus {
  id: string;
  displayName: string;
  isLocked: boolean;
  lockedAt: string | null;
}

const WORKFLOW_IDS = [
  { id: 'flyeasy_http_ingestion', displayName: 'Empty legs ingestion' },
  { id: 'watch_route_scan', displayName: 'Watch Route Scan' },
] as const;

const TTL_MINUTES = 15;

function isLockActive(lockedAt: string | null): boolean {
  if (!lockedAt) return false;
  const lockTime = new Date(lockedAt).getTime();
  if (lockTime < 1000000000000) return false;
  const expiryTime = lockTime + TTL_MINUTES * 60 * 1000;
  return Date.now() < expiryTime;
}

export function useWorkflowLocks() {
  return useQuery({
    queryKey: ['external', 'workflow_locks'],
    queryFn: async (): Promise<WorkflowLockStatus[]> => {
      const ids = WORKFLOW_IDS.map(w => w.id);
      const { data } = await adminSelect<WorkflowLock[]>({
        table: 'workflow_locks',
        columns: 'id, locked_at',
        filters: [{ col: 'id', op: 'in', value: ids }],
      });


      const lockMap = new Map<string, string>();
      (data || []).forEach(lock => {
        lockMap.set(lock.id, lock.locked_at);
      });

      return WORKFLOW_IDS.map(workflow => {
        const lockedAt = lockMap.get(workflow.id) ?? null;
        return {
          id: workflow.id,
          displayName: workflow.displayName,
          isLocked: isLockActive(lockedAt),
          lockedAt: isLockActive(lockedAt) ? lockedAt : null,
        };
      });
    },
    refetchInterval: 30000,
  });
}

export function useHasActiveWorkflowLock() {
  const { data: locks } = useWorkflowLocks();
  return locks?.some(lock => lock.isLocked) ?? false;
}
