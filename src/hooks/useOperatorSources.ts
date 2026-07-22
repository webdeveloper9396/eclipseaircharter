import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminRpc, adminSelect } from '@/lib/admin-proxy';
import type { OperatorSource, OperatorSourceType } from '@/integrations/external-supabase/types';

// Fetch operator sources for a specific operator (admin proxy read)
export function useOperatorSources(operatorId?: string) {
  return useQuery({
    queryKey: ['external', 'operator_sources', operatorId],
    queryFn: async () => {
      const { data } = await adminSelect<OperatorSource[]>({
        table: 'operator_sources',
        columns: '*',
        filters: [{ col: 'operator_id', op: 'eq', value: operatorId! }],
        order: [{ column: 'created_at', ascending: false }],
      });
      return data;
    },
    enabled: !!operatorId,
  });
}

// Fetch enabled source for each operator (admin proxy read)
export function useOperatorsEnabledSources() {
  return useQuery({
    queryKey: ['external', 'operator_sources_enabled'],
    queryFn: async () => {
      const { data } = await adminSelect<
        Pick<OperatorSource, 'operator_id' | 'source_type' | 'failure_streak' | 'last_error_at'>[]
      >({
        table: 'operator_sources',
        columns: 'operator_id, source_type, failure_streak, last_error_at',
        filters: [{ col: 'enabled', op: 'eq', value: true }],
      });
      return data;
    },
  });
}

// Create operator source (proxied)
export function useCreateOperatorSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      p_operator_id: string;
      p_source_type: OperatorSourceType;
      p_enabled?: boolean;
      p_source_config?: Record<string, unknown>;
      p_poll_interval_minutes?: number;
    }) => {
      return adminRpc<OperatorSource>('create_operator_source_v1', params);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['external', 'operator_sources', variables.p_operator_id] });
      queryClient.invalidateQueries({ queryKey: ['external', 'operator_sources_enabled'] });
    },
  });
}

// Update operator source (proxied)
export function useUpdateOperatorSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      p_source_id: string;
      p_source_config?: Record<string, unknown>;
      p_poll_interval_minutes?: number;
      operator_id: string;
    }) => {
      const { operator_id: _operatorId, ...rpcParams } = params;
      return adminRpc<OperatorSource>('update_operator_source_v1', rpcParams);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['external', 'operator_sources', variables.operator_id] });
    },
  });
}

// Set operator source enabled (proxied)
export function useSetOperatorSourceEnabled() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      p_operator_source_id: string;
      p_enabled: boolean;
      operator_id: string;
    }) => {
      const { operator_id: _operatorId, ...rpcParams } = params;
      return adminRpc('set_operator_source_enabled_v1', rpcParams);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['external', 'operator_sources', variables.operator_id] });
      queryClient.invalidateQueries({ queryKey: ['external', 'operator_sources_enabled'] });
    },
  });
}

export function isEnabledSourceConflict(error: Error): boolean {
  const msg = error.message?.toLowerCase() || '';
  return msg.includes('unique') || msg.includes('one enabled source') || msg.includes('already has an enabled');
}
