import { useQuery } from '@tanstack/react-query';
import { externalSupabase } from '@/integrations/external-supabase';
import { adminSelect } from '@/lib/admin-proxy';
import type {
  Operator,
  OperatorAlias,
  OperatorSoldPolicy,
  OperatorSnapshotState,
  SystemEvent,
  AircraftType,
  AircraftCategory,
  AircraftTypeAlias,
  Airport,
  Corridor,
  CorridorAirport,
  CorridorRecommendation,
  EmptyLeg
} from '@/integrations/external-supabase/types';

// ============================================================================
// ADMIN PROXY READS
// Reads against admin/internal objects go through the external-admin-proxy
// edge function. Public-facing reads (airports, empty_legs, aircraft_types,
// aircraft_type_images) remain on the browser anon client because public
// search depends on them.
// ============================================================================

// Operators
export function useOperators() {
  return useQuery({
    queryKey: ['external', 'operators'],
    queryFn: async () => {
      const { data } = await adminSelect<Operator[]>({
        table: 'operators',
        columns: '*',
        order: [{ column: 'name', ascending: true }],
      });
      return data;
    },
  });
}

export function useOperatorAliases(operatorId?: string) {
  return useQuery({
    queryKey: ['external', 'operator_aliases', operatorId],
    queryFn: async () => {
      const { data } = await adminSelect<OperatorAlias[]>({
        table: 'operator_aliases',
        columns: '*',
        filters: operatorId ? [{ col: 'operator_id', op: 'eq', value: operatorId }] : [],
        order: [{ column: 'alias', ascending: true }],
      });
      return data;
    },
    enabled: operatorId !== undefined,
  });
}

// System Events
export function useSystemEvents(limit = 100) {
  return useQuery({
    queryKey: ['external', 'system_events', limit],
    queryFn: async () => {
      const { data } = await adminSelect<SystemEvent[]>({
        table: 'system_events',
        columns: '*',
        order: [{ column: 'observed_at', ascending: false }],
        limit,
      });
      return data;
    },
  });
}

// System Events for Review Queue (filtered)
const AUDIT_ONLY_EVENT_TYPES = [
  'aircraft_type_alias_added',
  'aircraft_type_alias_add_skipped_unique_violation',
  'empty_leg_ingestion_metrics_v1',
  'empty_leg_reject_metrics_v1',
  'operator_inventory_mode_set',
];

export type ReviewQueueFilter = 'actionable' | 'all_warn_error' | 'all';

export function useSystemEventsForReview(filter: ReviewQueueFilter = 'actionable', limit = 200) {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const cutoffDate = fourteenDaysAgo.toISOString();

  return useQuery({
    queryKey: ['external', 'system_events_review', filter, limit],
    queryFn: async () => {
      const filters: Array<{ col: string; op: 'gte'; value: string }> = [];
      let or: string | undefined;

      if (filter === 'actionable') {
        or = 'severity.eq.warn,severity.eq.error';
        filters.push({ col: 'observed_at', op: 'gte', value: cutoffDate });
      } else if (filter === 'all_warn_error') {
        or = 'severity.eq.warn,severity.eq.error';
      }

      const { data } = await adminSelect<SystemEvent[]>({
        table: 'system_events',
        columns: '*',
        filters,
        or,
        order: [{ column: 'observed_at', ascending: false }],
        limit,
      });

      let result = data;
      if (filter === 'actionable') {
        result = result.filter(e => !AUDIT_ONLY_EVENT_TYPES.includes(e.event_type));
      }
      return result;
    },
  });
}

// Aircraft
export function useAircraftCategories() {
  return useQuery({
    queryKey: ['external', 'aircraft_categories'],
    queryFn: async () => {
      const { data } = await adminSelect<AircraftCategory[]>({
        table: 'aircraft_categories',
        columns: '*',
        order: [{ column: 'id', ascending: true }],
      });
      return data;
    },
  });
}

export function useAircraftTypes() {
  return useQuery({
    queryKey: ['external', 'aircraft_types'],
    queryFn: async () => {
      // Public-direct: aircraft_types is read by public search rendering.
      const { data, error } = await externalSupabase
        .from('aircraft_types')
        .select('*')
        .order('manufacturer, model');
      if (error) throw error;
      return data as AircraftType[];
    },
  });
}

export function useAircraftTypeAliases(typeId?: string) {
  return useQuery({
    queryKey: ['external', 'aircraft_type_aliases', typeId],
    queryFn: async () => {
      const { data } = await adminSelect<AircraftTypeAlias[]>({
        table: 'aircraft_type_aliases',
        columns: '*',
        filters: typeId ? [{ col: 'aircraft_type_id', op: 'eq', value: typeId }] : [],
        order: [{ column: 'alias', ascending: true }],
      });
      return data;
    },
    enabled: typeId !== undefined,
  });
}

export interface AircraftTypeImages {
  aircraft_type_id: string;
  exterior_image_path: string | null;
  interior_image_path: string | null;
}

export function useAircraftTypeImages(typeId?: string) {
  return useQuery({
    queryKey: ['external', 'aircraft_type_images', typeId],
    queryFn: async () => {
      // Public-direct: read by public search cards.
      const { data, error } = await externalSupabase
        .from('aircraft_type_images')
        .select('aircraft_type_id, exterior_image_path, interior_image_path')
        .eq('aircraft_type_id', typeId!)
        .maybeSingle();
      if (error) throw error;
      return data as AircraftTypeImages | null;
    },
    enabled: !!typeId,
  });
}

export function useAllAircraftTypeImages() {
  return useQuery({
    queryKey: ['external', 'aircraft_type_images_all'],
    queryFn: async () => {
      // Public-direct.
      const { data, error } = await externalSupabase
        .from('aircraft_type_images')
        .select('aircraft_type_id, exterior_image_path, interior_image_path');
      if (error) throw error;
      return data as AircraftTypeImages[];
    },
  });
}

// Airports (public-direct, used by public + admin search)
export function useAirports() {
  return useQuery({
    queryKey: ['external', 'airports'],
    queryFn: async () => {
      const { data, error } = await externalSupabase
        .from('airports')
        .select('*')
        .order('icao');
      if (error) throw error;
      return data as Airport[];
    },
  });
}

export function useAirportsSearch(search: string, limit = 200) {
  const trimmed = search.trim();

  return useQuery({
    queryKey: ['external', 'airports-search', trimmed, limit],
    queryFn: async () => {
      if (!trimmed) {
        const { data, error } = await externalSupabase
          .from('airports')
          .select('*')
          .order('icao')
          .limit(limit);
        if (error) throw error;
        return data as Airport[];
      }

      const q = trimmed.replace(/,/g, '');
      const { data, error } = await externalSupabase
        .from('airports')
        .select('*')
        .or(`icao.ilike.%${q}%,iata.ilike.%${q}%,city.ilike.%${q}%`)
        .order('icao')
        .limit(limit);

      if (error) throw error;
      return data as Airport[];
    },
    staleTime: 30 * 1000,
  });
}

// Corridors (admin reads)
export function useCorridors() {
  return useQuery({
    queryKey: ['external', 'corridors'],
    queryFn: async () => {
      const { data } = await adminSelect<Corridor[]>({
        table: 'corridors',
        columns: '*',
        order: [{ column: 'display_name', ascending: true }],
      });
      return data;
    },
  });
}

export function useCorridorAirports(corridorId?: string) {
  return useQuery({
    queryKey: ['external', 'corridor_airports', corridorId],
    queryFn: async () => {
      const { data } = await adminSelect<CorridorAirport[]>({
        table: 'corridor_airports',
        columns: '*',
        filters: corridorId ? [{ col: 'corridor_id', op: 'eq', value: corridorId }] : [],
        order: [
          { column: 'side', ascending: true },
          { column: 'priority', ascending: true },
        ],
      });
      return data;
    },
  });
}

// Empty Legs (read-only inventory) with joined aircraft type
// Stays on the browser anon client — `empty_legs` is a public-direct object.
export interface EmptyLegWithAircraftType extends EmptyLeg {
  aircraft_type?: {
    manufacturer: string;
    model: string;
    category?: {
      id: string;
      display_name: string;
    } | null;
  } | null;
}

export interface EmptyLegsFilters {
  status?: string;
  operatorId?: string;
  routeSearch?: string;
  aircraftSearch?: string;
  operatorSearch?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedEmptyLegs {
  data: EmptyLegWithAircraftType[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function buildRouteFilter(search: string): string {
  const q = search.trim().replace(/,/g, '');
  return `departure_airport_icao.ilike.%${q}%,arrival_airport_icao.ilike.%${q}%,departure_corridor.ilike.%${q}%,arrival_corridor.ilike.%${q}%`;
}

function buildAircraftFilter(search: string): string {
  const q = search.trim().replace(/,/g, '');
  return `aircraft_model.ilike.%${q}%`;
}

// Operator ID lookup for the admin Inventory page filter.
// Moved to adminSelect (operators is an admin-only object).
async function getOperatorIdsMatchingSearch(search: string): Promise<string[]> {
  const q = search.trim().replace(/,/g, '');
  const { data } = await adminSelect<{ id: string }[]>({
    table: 'operators',
    columns: 'id',
    filters: [{ col: 'name', op: 'ilike', value: `%${q}%` }],
  });
  return (data || []).map(op => op.id);
}

export function useEmptyLegs(filters?: EmptyLegsFilters) {
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 50;

  return useQuery({
    queryKey: ['external', 'empty_legs', filters],
    queryFn: async (): Promise<PaginatedEmptyLegs> => {
      let matchingOperatorIds: string[] = [];
      if (filters?.operatorSearch?.trim()) {
        matchingOperatorIds = await getOperatorIdsMatchingSearch(filters.operatorSearch);
      }

      const buildCombinedOperatorFilter = (search: string, operatorIds: string[]): string => {
        const q = search.trim().replace(/,/g, '');
        const rawFilter = `operator_name_raw.ilike.%${q}%`;
        if (operatorIds.length > 0) {
          return `${rawFilter},operator_id.in.(${operatorIds.join(',')})`;
        }
        return rawFilter;
      };

      let countQuery = externalSupabase
        .from('empty_legs')
        .select('id', { count: 'exact', head: true });

      if (filters?.status && filters.status !== 'all') {
        countQuery = countQuery.eq('status', filters.status);
      }
      if (filters?.operatorId) {
        countQuery = countQuery.eq('operator_id', filters.operatorId);
      }
      if (filters?.routeSearch?.trim()) {
        countQuery = countQuery.or(buildRouteFilter(filters.routeSearch));
      }
      if (filters?.aircraftSearch?.trim()) {
        countQuery = countQuery.or(buildAircraftFilter(filters.aircraftSearch));
      }
      if (filters?.operatorSearch?.trim()) {
        countQuery = countQuery.or(buildCombinedOperatorFilter(filters.operatorSearch, matchingOperatorIds));
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;

      const totalCount = count || 0;
      const totalPages = Math.ceil(totalCount / pageSize);

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = externalSupabase
        .from('empty_legs')
        .select(`
          *,
          aircraft_type:aircraft_types!aircraft_type_id (
            manufacturer,
            model,
            category:aircraft_categories!category_id (
              id,
              display_name
            )
          )
        `)
        .order('last_seen_at', { ascending: false })
        .range(from, to);

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters?.operatorId) {
        query = query.eq('operator_id', filters.operatorId);
      }
      if (filters?.routeSearch?.trim()) {
        query = query.or(buildRouteFilter(filters.routeSearch));
      }
      if (filters?.aircraftSearch?.trim()) {
        query = query.or(buildAircraftFilter(filters.aircraftSearch));
      }
      if (filters?.operatorSearch?.trim()) {
        query = query.or(buildCombinedOperatorFilter(filters.operatorSearch, matchingOperatorIds));
      }

      const { data, error } = await query;
      if (error) throw error;

      return {
        data: data as EmptyLegWithAircraftType[],
        totalCount,
        page,
        pageSize,
        totalPages,
      };
    },
  });
}

export function getAircraftDisplayName(leg: EmptyLegWithAircraftType): string {
  if (leg.aircraft_type) {
    return `${leg.aircraft_type.manufacturer} ${leg.aircraft_type.model}`;
  }
  if (leg.aircraft_model) {
    return leg.aircraft_model;
  }
  if (leg.aircraft_category) {
    return leg.aircraft_category;
  }
  return '—';
}

export function getCategoryDisplayName(leg: EmptyLegWithAircraftType): string {
  if (leg.aircraft_type?.category?.display_name) {
    return leg.aircraft_type.category.display_name;
  }
  if (leg.aircraft_category) {
    return leg.aircraft_category.charAt(0).toUpperCase() + leg.aircraft_category.slice(1);
  }
  return '—';
}

// ============= Overview Metrics Hooks (admin proxy) =============

export function useInventoryRunsCount(hours: number) {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hours);
  const cutoff = cutoffDate.toISOString();

  return useQuery({
    queryKey: ['external', 'inventory_runs_count', hours],
    queryFn: async () => {
      const { count } = await adminSelect({
        table: 'operator_inventory_runs',
        columns: 'id',
        filters: [{ col: 'received_at', op: 'gte', value: cutoff }],
        count: 'exact',
        limit: 1,
      });
      return count ?? 0;
    },
  });
}

export function useDistinctOperatorsCount(hours: number) {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hours);
  const cutoff = cutoffDate.toISOString();

  return useQuery({
    queryKey: ['external', 'distinct_operators_count', hours],
    queryFn: async () => {
      const { data } = await adminSelect<{ operator_id: string }[]>({
        table: 'operator_inventory_runs',
        columns: 'operator_id',
        filters: [{ col: 'received_at', op: 'gte', value: cutoff }],
      });
      const uniqueOperators = new Set((data || []).map(r => r.operator_id));
      return uniqueOperators.size;
    },
  });
}

export function useLegsIngestedCount(days: number) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoff = cutoffDate.toISOString();

  return useQuery({
    queryKey: ['external', 'legs_ingested_count', days],
    queryFn: async () => {
      const { count } = await adminSelect({
        table: 'empty_legs',
        columns: 'id',
        filters: [{ col: 'first_seen_at', op: 'gte', value: cutoff }],
        count: 'exact',
        limit: 1,
      });
      return count ?? 0;
    },
  });
}

export function useLegsSoldCount(days: number) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoff = cutoffDate.toISOString();

  return useQuery({
    queryKey: ['external', 'legs_sold_count', days],
    queryFn: async () => {
      const { count } = await adminSelect({
        table: 'empty_legs',
        columns: 'id',
        filters: [
          { col: 'status', op: 'eq', value: 'sold' },
          { col: 'sold_detected_at', op: 'gte', value: cutoff },
        ],
        count: 'exact',
        limit: 1,
      });
      return count ?? 0;
    },
  });
}

export function useUnclassifiedOperatorsCount() {
  return useQuery({
    queryKey: ['external', 'unclassified_operators_count'],
    queryFn: async () => {
      const { count } = await adminSelect({
        table: 'operators',
        columns: 'id',
        filters: [{ col: 'inventory_mode', op: 'eq', value: 'unclassified' }],
        count: 'exact',
        limit: 1,
      });
      return count ?? 0;
    },
  });
}

export function usePendingActionableEventsCount() {
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const cutoff = fourteenDaysAgo.toISOString();

  const auditTypes = [
    'aircraft_type_alias_added',
    'aircraft_type_alias_add_skipped_unique_violation',
    'empty_leg_ingestion_metrics_v1',
    'empty_leg_reject_metrics_v1',
    'operator_inventory_mode_set',
  ];

  return useQuery({
    queryKey: ['external', 'pending_actionable_events_count'],
    queryFn: async () => {
      const { data } = await adminSelect<{ id: string; event_type: string }[]>({
        table: 'system_events',
        columns: 'id, event_type',
        or: 'severity.eq.warn,severity.eq.error',
        filters: [{ col: 'observed_at', op: 'gte', value: cutoff }],
      });
      const actionable = (data || []).filter(e => !auditTypes.includes(e.event_type));
      return actionable.length;
    },
  });
}

export function useErrorsCount(hours: number) {
  const cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - hours);
  const cutoff = cutoffDate.toISOString();

  return useQuery({
    queryKey: ['external', 'errors_count', hours],
    queryFn: async () => {
      const { count } = await adminSelect({
        table: 'system_events',
        columns: 'id',
        filters: [
          { col: 'severity', op: 'eq', value: 'error' },
          { col: 'observed_at', op: 'gte', value: cutoff },
        ],
        count: 'exact',
        limit: 1,
      });
      return count ?? 0;
    },
  });
}

// ============= Active Inventory Metrics Hooks =============

export function useActiveEmptyLegsCount() {
  return useQuery({
    queryKey: ['external', 'active_empty_legs_count'],
    queryFn: async () => {
      const { count } = await adminSelect({
        table: 'empty_legs',
        columns: 'id',
        filters: [{ col: 'status', op: 'eq', value: 'active' }],
        count: 'exact',
        limit: 1,
      });
      return count ?? 0;
    },
  });
}

export function useActiveOperatorsCount() {
  return useQuery({
    queryKey: ['external', 'active_operators_count'],
    queryFn: async () => {
      const { data } = await adminSelect<{ operator_id: string }[]>({
        table: 'empty_legs',
        columns: 'operator_id',
        filters: [{ col: 'status', op: 'eq', value: 'active' }],
      });
      const uniqueOperators = new Set((data || []).map(r => r.operator_id));
      return uniqueOperators.size;
    },
  });
}

export function useActiveAircraftTypesCount() {
  return useQuery({
    queryKey: ['external', 'active_aircraft_types_count'],
    queryFn: async () => {
      const { data } = await adminSelect<{ aircraft_type_id: string }[]>({
        table: 'empty_legs',
        columns: 'aircraft_type_id',
        filters: [
          { col: 'status', op: 'eq', value: 'active' },
          { col: 'aircraft_type_id', op: 'is', value: null, negate: true },
        ],
      });
      const uniqueTypes = new Set((data || []).map(r => r.aircraft_type_id));
      return uniqueTypes.size;
    },
  });
}

export interface CategoryBreakdown {
  name: string;
  count: number;
  sortOrder: number;
}

export function useActiveInventoryByCategory() {
  return useQuery({
    queryKey: ['external', 'active_inventory_by_category'],
    queryFn: async () => {
      const { data: legs } = await adminSelect<
        Array<{
          aircraft_category: string | null;
          aircraft_type: {
            category: { id: string; display_name: string; sort_order: number } | null;
          } | null;
        }>
      >({
        table: 'empty_legs',
        columns: `
          aircraft_category,
          aircraft_type:aircraft_types!aircraft_type_id (
            category:aircraft_categories!category_id (
              id,
              display_name,
              sort_order
            )
          )
        `,
        filters: [{ col: 'status', op: 'eq', value: 'active' }],
      });

      const { data: categories } = await adminSelect<
        Array<{ id: string; display_name: string; sort_order: number }>
      >({
        table: 'aircraft_categories',
        columns: 'id, display_name, sort_order',
        order: [{ column: 'sort_order', ascending: true }],
      });

      const catSortMap = new Map<string, number>();
      (categories || []).forEach((cat) => {
        catSortMap.set(cat.display_name, cat.sort_order);
      });

      const breakdown: Record<string, { count: number; sortOrder: number }> = {};

      (legs || []).forEach((leg) => {
        let catName: string;
        let sortOrder: number;

        if (leg.aircraft_type?.category?.display_name) {
          catName = leg.aircraft_type.category.display_name;
          sortOrder = leg.aircraft_type.category.sort_order;
        } else if (leg.aircraft_category) {
          catName = leg.aircraft_category.charAt(0).toUpperCase() + leg.aircraft_category.slice(1);
          sortOrder = catSortMap.get(catName) ?? 998;
        } else {
          catName = 'Unknown';
          sortOrder = 999;
        }

        if (!breakdown[catName]) {
          breakdown[catName] = { count: 0, sortOrder };
        }
        breakdown[catName].count++;
      });

      const result: CategoryBreakdown[] = Object.entries(breakdown)
        .map(([name, { count, sortOrder }]) => ({ name, count, sortOrder }))
        .sort((a, b) => a.sortOrder - b.sortOrder);

      return result;
    },
  });
}

// Operator Sold Policy (admin proxy)
export function useOperatorSoldPolicy(operatorId: string) {
  return useQuery({
    queryKey: ['external', 'operator_sold_policy', operatorId],
    queryFn: async () => {
      const { data } = await adminSelect<OperatorSoldPolicy | null>({
        table: 'operator_sold_policy',
        columns: '*',
        filters: [{ col: 'operator_id', op: 'eq', value: operatorId }],
        single: 'maybe',
      });
      return data;
    },
    enabled: !!operatorId,
  });
}

// Operator Snapshot State (admin proxy)
export function useOperatorSnapshotState(operatorId: string) {
  return useQuery({
    queryKey: ['external', 'operator_snapshot_state', operatorId],
    queryFn: async () => {
      const { data } = await adminSelect<OperatorSnapshotState | null>({
        table: 'operator_snapshot_state',
        columns: '*',
        filters: [{ col: 'operator_id', op: 'eq', value: operatorId }],
        single: 'maybe',
      });
      return data;
    },
    enabled: !!operatorId,
  });
}

// Corridor Recommendations (admin proxy)
export function useCorridorRecommendations(
  statusFilter: string = 'open',
  sourceVendorFilter: string = 'all',
  sideFilter: string = 'all',
  searchText: string = ''
) {
  return useQuery({
    queryKey: ['external', 'corridor_recommendations', statusFilter, sourceVendorFilter, sideFilter, searchText],
    queryFn: async () => {
      const filters: Array<{ col: string; op: 'eq' | 'ilike'; value: string }> = [];

      if (statusFilter && statusFilter !== 'all') {
        filters.push({ col: 'status', op: 'eq', value: statusFilter });
      }
      if (sourceVendorFilter && sourceVendorFilter !== 'all') {
        filters.push({ col: 'source_vendor', op: 'eq', value: sourceVendorFilter });
      }
      if (sideFilter && sideFilter !== 'all') {
        filters.push({ col: 'side', op: 'eq', value: sideFilter });
      }
      if (searchText) {
        filters.push({ col: 'raw_label', op: 'ilike', value: `%${searchText}%` });
      }

      const { data } = await adminSelect<CorridorRecommendation[]>({
        table: 'corridor_recommendations',
        columns: '*',
        filters,
        order: [{ column: 'created_at', ascending: false }],
      });
      return data || [];
    },
  });
}
