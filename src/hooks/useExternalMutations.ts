import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminRpc, adminTableUpdate } from '@/lib/admin-proxy';
import type { InventoryMode, Operator } from '@/integrations/external-supabase/types';

// NOTE: Corridor mutations have been moved to src/hooks/useCorridors.ts
// The v1 corridor RPCs are deprecated and should not be used.

// Airport batch mutations
export function useAirportsBatchAddTags() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: { p_airport_ids: string[]; p_tags: string[] }) => {
      return adminRpc('admin_airports_batch_add_tags', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external', 'airports'] });
    },
  });
}

export function useAirportsBatchRemoveTags() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: { p_airport_ids: string[]; p_tags: string[] }) => {
      return adminRpc('admin_airports_batch_remove_tags', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external', 'airports'] });
    },
  });
}

export function useAirportsBatchSetAdminRank() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: { p_airport_ids: string[]; p_admin_rank: number }) => {
      return adminRpc('admin_airports_batch_set_admin_rank', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external', 'airports'] });
    },
  });
}

export function useAirportsBatchSetExclude() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: { p_airport_ids: string[]; p_exclude: boolean }) => {
      return adminRpc('admin_airports_batch_set_exclude_from_search', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external', 'airports'] });
    },
  });
}

// Operator mutations
export function useOperatorSetInventoryMode() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: { p_operator_id: string; p_inventory_mode: InventoryMode }) => {
      return adminRpc('admin_operator_set_inventory_mode', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external', 'operators'] });
    },
  });
}

export function useOperatorSetVerified() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: { p_operator_id: string; p_verified: boolean }) => {
      return adminRpc('admin_operator_set_verified', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external', 'operators'] });
    },
  });
}

export function useOperatorUpdate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: { 
      id: string; 
      email_addresses?: string[] | null;
      default_currency?: string | null;
    }) => {
      const { id, ...updates } = params;
      return adminTableUpdate('operators', id, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external', 'operators'] });
    },
  });
}

// Aircraft type mutations
export function useAircraftTypeCreate() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: {
      p_manufacturer?: string;
      p_model: string;
      p_category_id: string;
      p_icao_type_code?: string;
      p_active?: boolean;
    }) => {
      return adminRpc('create_aircraft_type', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external', 'aircraft_types'] });
    },
  });
}

export function useAircraftTypeAddAlias() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: { p_aircraft_type_id: string; p_alias: string }) => {
      return adminRpc<{ created: boolean }>('admin_aircraft_type_add_alias', params);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['external', 'aircraft_type_aliases', variables.p_aircraft_type_id] });
    },
  });
}

export function useAircraftTypeAliasLookup() {
  return useMutation({
    mutationFn: async (params: { p_alias: string }) => {
      return adminRpc<{ aircraft_type_id: string; manufacturer: string; model: string; category_id: string | null } | null>('admin_aircraft_type_alias_lookup', params);
    },
  });
}

export function useAircraftTypeRemoveAlias() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (params: { p_alias_id: string; aircraft_type_id: string }) => {
      return adminRpc('admin_aircraft_type_remove_alias', { p_alias_id: params.p_alias_id });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['external', 'aircraft_type_aliases', variables.aircraft_type_id] });
    },
  });
}

// Create Operator
export function useOperatorCreate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      p_name: string;
      p_email_addresses: string[];
      p_inventory_mode?: string;
      p_default_currency?: string | null;
      p_verified?: boolean;
      p_notes?: string | null;
      p_llm_instructions?: string | null;
    }) => {
      return adminRpc<Operator>('admin_operator_create', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external', 'operators'] });
    },
  });
}

// Operator Alias mutations
export function useOperatorAliasAdd() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { p_operator_id: string; p_alias: string }) => {
      return adminRpc<{ id: string; operator_id: string; alias: string; created_at: string }>('admin_operator_alias_add', params);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['external', 'operator_aliases', variables.p_operator_id] });
    },
  });
}

export function useOperatorAliasRemove() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { p_operator_alias_id: string; operator_id: string }) => {
      return adminRpc<boolean>('admin_operator_alias_remove', { p_operator_alias_id: params.p_operator_alias_id });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['external', 'operator_aliases', variables.operator_id] });
    },
  });
}

// Corridor recommendation mutations
export function useDeleteCorridorRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { p_id: string }) => {
      return adminRpc('admin_delete_corridor_recommendation_v1', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external', 'corridor_recommendations'] });
    },
  });
}

// Aircraft type image mutations
export function useAircraftTypeSetImages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      p_aircraft_type_id: string;
      p_exterior_image_path: string | null;
      p_interior_image_path: string | null;
    }) => {
      return adminRpc('admin_aircraft_type_set_images', params);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['external', 'aircraft_type_images', variables.p_aircraft_type_id],
      });
      queryClient.invalidateQueries({
        queryKey: ['external', 'aircraft_type_images_all'],
      });
    },
  });
}
