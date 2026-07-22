import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { externalSupabase } from '@/integrations/external-supabase';
import { adminRpc, adminSelect } from '@/lib/admin-proxy';
import type {
  CorridorSummary,
  CorridorSide,
  CorridorAirport,
  Airport,
  Corridor,
  CorridorPurpose,
  CorridorValidationIssue
} from '@/integrations/external-supabase/types';

// ============= Reads (admin proxy for admin/internal objects) =============

// Corridor list from the summary view (admin)
export function useCorridorSummaries() {
  return useQuery({
    queryKey: ['external', 'corridor_summaries'],
    queryFn: async () => {
      const { data } = await adminSelect<CorridorSummary[]>({
        table: 'corridor_summary_v1',
        columns: '*',
        order: [
          { column: 'purpose', ascending: true },
          { column: 'picker_rank', ascending: true, nullsFirst: false },
          { column: 'display_name', ascending: true },
        ],
      });
      return data;
    },
  });
}

// Expansion corridors for parent dropdown (admin)
export function useExpansionCorridors(excludeId?: string) {
  return useQuery({
    queryKey: ['external', 'expansion_corridors', excludeId],
    queryFn: async () => {
      const filters: Array<{ col: string; op: 'eq' | 'neq'; value: unknown }> = [
        { col: 'purpose', op: 'eq', value: 'expansion' },
        { col: 'active', op: 'eq', value: true },
      ];
      if (excludeId) filters.push({ col: 'id', op: 'neq', value: excludeId });

      const { data } = await adminSelect<{ id: string; display_name: string }[]>({
        table: 'corridor_summary_v1',
        columns: 'id, display_name',
        filters,
        order: [{ column: 'display_name', ascending: true }],
      });
      return data;
    },
  });
}

// Corridor membership with airport details
export interface CorridorMembershipWithAirport extends CorridorAirport {
  airport: {
    icao: string;
    iata: string | null;
    name: string;
    city: string | null;
    state: string | null;
    country: string;
  } | null;
}

export function useCorridorMembership(corridorId?: string) {
  return useQuery({
    queryKey: ['external', 'corridor_membership', corridorId],
    queryFn: async () => {
      if (!corridorId) return [];

      const { data: memberships } = await adminSelect<CorridorAirport[]>({
        table: 'corridor_airports',
        columns: '*',
        filters: [{ col: 'corridor_id', op: 'eq', value: corridorId }],
        order: [
          { column: 'side', ascending: true },
          { column: 'priority', ascending: false },
        ],
      });

      if (!memberships || memberships.length === 0) return [];

      const airportCodes = memberships.map(m => m.airport_code);
      // airports is public-direct.
      const { data: airports, error: airportsError } = await externalSupabase
        .from('airports')
        .select('icao, iata, name, city, state, country')
        .in('icao', airportCodes);

      if (airportsError) throw airportsError;

      type AirportDetail = { icao: string; iata: string | null; name: string; city: string | null; state: string | null; country: string };
      const typedAirports = airports as AirportDetail[] | null;

      const airportMap = new Map(typedAirports?.map(a => [a.icao, a]) || []);

      return memberships.map(m => ({
        ...m,
        airport: airportMap.get(m.airport_code) || null,
      })) as CorridorMembershipWithAirport[];
    },
    enabled: !!corridorId,
  });
}

// Inherited corridor members from effective airports view
export interface InheritedMember {
  airport_code: string;
  source_corridor_id: string;
  resolved_depth: number;
  resolved_priority: number | null;
  airport: {
    icao: string;
    iata: string | null;
    name: string;
    city: string | null;
    state: string | null;
    country: string;
  } | null;
}

export function useCorridorInheritedMembers(corridorId?: string, _directCodes?: string[]) {
  return useQuery({
    queryKey: ['external', 'corridor_inherited_members', corridorId],
    queryFn: async () => {
      if (!corridorId) return [];

      type EffectiveRow = { airport_code: string; source_corridor_id: string; resolved_depth: number; resolved_priority: number | null };
      const { data: effective } = await adminSelect<EffectiveRow[]>({
        table: 'corridor_effective_airports_v1',
        columns: 'airport_code, source_corridor_id, resolved_depth, resolved_priority',
        filters: [
          { col: 'corridor_id', op: 'eq', value: corridorId },
          { col: 'resolved_depth', op: 'gt', value: 0 },
        ],
        order: [
          { column: 'resolved_depth', ascending: true },
          { column: 'resolved_priority', ascending: false, nullsFirst: false },
        ],
      });

      if (!effective || effective.length === 0) return [];

      const airportCodes = effective.map(m => m.airport_code);
      // airports is public-direct.
      const { data: airports, error: airportsError } = await externalSupabase
        .from('airports')
        .select('icao, iata, name, city, state, country')
        .in('icao', airportCodes);

      if (airportsError) throw airportsError;

      type AirportDetail = { icao: string; iata: string | null; name: string; city: string | null; state: string | null; country: string };
      const typedAirports = airports as AirportDetail[] | null;
      const airportMap = new Map(typedAirports?.map(a => [a.icao, a]) || []);

      return effective.map(m => ({
        ...m,
        airport: airportMap.get(m.airport_code) || null,
      })) as InheritedMember[];
    },
    enabled: !!corridorId,
  });
}

// Airport search excluding admin_exclude_from_search (public-direct: airports table)
export function useAirportsSearchFiltered(search: string, limit = 50) {
  const trimmed = search.trim();

  return useQuery({
    queryKey: ['external', 'airports-search-filtered', trimmed, limit],
    queryFn: async () => {
      if (!trimmed) {
        const { data, error } = await externalSupabase
          .from('airports')
          .select('*')
          .eq('admin_exclude_from_search', false)
          .order('icao')
          .limit(limit);
        if (error) throw error;
        return data as Airport[];
      }

      const q = trimmed.replace(/,/g, '');
      const { data, error } = await externalSupabase
        .from('airports')
        .select('*')
        .eq('admin_exclude_from_search', false)
        .or(`icao.ilike.%${q}%,iata.ilike.%${q}%,city.ilike.%${q}%`)
        .order('icao')
        .limit(limit);

      if (error) throw error;
      return data as Airport[];
    },
    staleTime: 30 * 1000,
  });
}

// ============= Writes (proxied through edge function) =============

export function useCorridorUpsertV2() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      p_id: string;
      p_display_name: string;
      p_purpose: CorridorPurpose;
      p_user_selectable?: boolean;
      p_expansion_parent_id?: string | null;
      p_picker_rank?: number | null;
      p_synonyms?: string[];
      p_notes?: string | null;
      p_active?: boolean;
      p_slug?: string | null;
    }) => {
      return adminRpc<Corridor>('admin_corridor_upsert_v2', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external', 'corridor_summaries'] });
      queryClient.invalidateQueries({ queryKey: ['external', 'expansion_corridors'] });
    },
  });
}

export function useCorridorSetActiveV2() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { p_id: string; p_active: boolean }) => {
      return adminRpc<{ updated_count: number }>('admin_corridor_set_active_v2', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external', 'corridor_summaries'] });
      queryClient.invalidateQueries({ queryKey: ['external', 'expansion_corridors'] });
    },
  });
}

export function useCorridorAirportUpsertV2() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      p_corridor_id: string;
      p_airport_code: string;
      p_side: CorridorSide;
      p_priority?: number | null;
    }) => {
      return adminRpc<CorridorAirport>('admin_corridor_airport_upsert_v2', params);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['external', 'corridor_membership', variables.p_corridor_id]
      });
      queryClient.invalidateQueries({ queryKey: ['external', 'corridor_summaries'] });
    },
  });
}

export function useCorridorAirportRemoveV2() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { p_corridor_id: string; p_airport_code: string }) => {
      return adminRpc<{ deleted_count: number }>('admin_corridor_airport_remove_v2', params);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['external', 'corridor_membership', variables.p_corridor_id]
      });
      queryClient.invalidateQueries({ queryKey: ['external', 'corridor_summaries'] });
    },
  });
}

export function useCorridorValidate() {
  return useMutation({
    mutationFn: async () => {
      return adminRpc<CorridorValidationIssue[]>('admin_corridor_validate_v1');
    },
  });
}
