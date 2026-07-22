import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/integrations/external-supabase";
import { adminRpc } from "@/lib/admin-proxy";
import type { Airport } from "@/integrations/external-supabase/types";

/**
 * Search airports via admin_search_airports_v1 RPC (proxied through edge function).
 * Requires admin authentication.
 */
export function useAdminSearchAirports(
  search: string,
  limit = 50,
  includeExcluded = false
) {
  const trimmed = search.trim();

  return useQuery({
    queryKey: ["external", "admin-search-airports", trimmed, limit, includeExcluded],
    queryFn: async () => {
      return adminRpc<Airport[]>('admin_search_airports_v1', {
        p_query: trimmed,
        p_limit: limit,
        p_include_excluded: includeExcluded,
      });
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Public airport search — queries the external airports table directly (no auth needed).
 * Searches across icao, iata, city, name fields.
 * Filters out admin_exclude_from_search airports.
 */
export function usePublicSearchAirports(search: string, limit = 20) {
  const trimmed = search.trim();

  return useQuery({
    queryKey: ["external", "public-search-airports", trimmed, limit],
    queryFn: async () => {
      let query = externalSupabase
        .from("airports")
        .select("*")
        .eq("admin_exclude_from_search", false)
        .order("admin_rank", { ascending: true, nullsFirst: false })
        .order("icao", { ascending: true })
        .limit(limit);

      if (trimmed) {
        const q = trimmed.replace(/,/g, "");
        query = query.or(
          `icao.ilike.%${q}%,iata.ilike.%${q}%,city.ilike.%${q}%,name.ilike.%${q}%,search_city_override.ilike.%${q}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Airport[];
    },
    staleTime: 30 * 1000,
  });
}

/**
 * @deprecated Use useAdminSearchAirports instead
 * Fetch airports that are searchable (admin_exclude_from_search = false)
 */
export function useSearchableAirports(search: string, limit = 200) {
  const trimmed = search.trim();

  return useQuery({
    queryKey: ["external", "searchable-airports", trimmed, limit],
    queryFn: async () => {
      let query = externalSupabase
        .from("airports")
        .select("*")
        .eq("admin_exclude_from_search", false)
        .order("icao")
        .limit(limit);

      if (trimmed) {
        const q = trimmed.replace(/,/g, "");
        query = query.or(
          `icao.ilike.%${q}%,iata.ilike.%${q}%,city.ilike.%${q}%,name.ilike.%${q}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Airport[];
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Fetch airports by a list of ICAO codes (for result display)
 */
export function useAirportsByIcaos(icaos: string[]) {
  const uniqueIcaos = [...new Set(icaos)].filter(Boolean);

  return useQuery({
    queryKey: ["external", "airports-by-icaos", uniqueIcaos],
    queryFn: async () => {
      if (uniqueIcaos.length === 0) return {};

      const { data, error } = await externalSupabase
        .from("airports")
        .select("*")
        .in("icao", uniqueIcaos);

      if (error) throw error;

      // Create a lookup map
      const map: Record<string, Airport> = {};
      for (const airport of data || []) {
        map[airport.icao] = airport;
      }
      return map;
    },
    enabled: uniqueIcaos.length > 0,
    staleTime: 60 * 1000,
  });
}

export interface ClientSearchResult {
  id: string;
  departure_airport_icao: string | null;
  arrival_airport_icao: string | null;
  departure_location_type: string;
  arrival_location_type: string;
  departure_corridor: string | null;
  arrival_corridor: string | null;
  departure_location_raw: string | null;
  arrival_location_raw: string | null;
  departure_date_start: string;
  departure_date_end: string;
  aircraft_model: string | null;
  aircraft_category: string | null;
  aircraft_type_id: string | null;
  price: number | null;
  price_currency: string | null;
  last_seen_at: string;
  first_seen_at: string | null;
  operator_id: string | null;
  origin_depth: number;
  dest_depth: number;
  match_label: string;
  match_score: number;
  exterior_image_path: string | null;
  interior_image_path: string | null;
}


export interface AircraftType {
  id: string;
  manufacturer: string | null;
  model: string | null;
  exterior_image_path: string | null;
  interior_image_path: string | null;
}

/**
 * Fetch aircraft types by a list of IDs (for result display)
 */
export function useAircraftTypesByIds(typeIds: string[]) {
  const uniqueIds = [...new Set(typeIds)].filter(Boolean);

  return useQuery({
    queryKey: ["external", "aircraft-types-by-ids", uniqueIds],
    queryFn: async () => {
      if (uniqueIds.length === 0) return {};

      const { data, error } = await externalSupabase
        .from("aircraft_types")
        .select("id, manufacturer, model")
        .in("id", uniqueIds);

      if (error) throw error;

      // Create a lookup map
      const map: Record<string, AircraftType> = {};
      for (const type of data || []) {
        map[type.id] = type;
      }
      return map;
    },
    enabled: uniqueIds.length > 0,
    staleTime: 60 * 1000,
  });
}

export interface ClientSearchParams {
  originIcao: string;
  destIcao: string;
  dateStart: string;
  dateEnd: string;
}

const RESULTS_PER_PAGE = 50;

/**
 * Fetch exact airport-to-airport matches directly from empty_legs table (fast)
 */
async function fetchExactMatches(
  params: ClientSearchParams
): Promise<ClientSearchResult[]> {
  console.log("[ClientSearch] Fetching exact matches for:", params.originIcao, "->", params.destIcao);

  const { data, error } = await externalSupabase
    .from("empty_legs")
    .select("id, departure_airport_icao, arrival_airport_icao, departure_location_type, arrival_location_type, departure_corridor, arrival_corridor, departure_location_raw, arrival_location_raw, departure_date_start, departure_date_end, aircraft_model, aircraft_category, aircraft_type_id, price, price_currency, last_seen_at, first_seen_at, operator_id")
    .eq("status", "active")
    .eq("departure_airport_icao", params.originIcao)
    .eq("arrival_airport_icao", params.destIcao)
    .gte("departure_date_start", params.dateStart)
    .lte("departure_date_start", params.dateEnd)
    .order("departure_date_start", { ascending: true })
    .limit(RESULTS_PER_PAGE);

  if (error) {
    console.error("[ClientSearch] Exact query error:", error);
    throw new Error(error.message || "Search failed");
  }

  // Map to ClientSearchResult format with exact match indicators
  const results: ClientSearchResult[] = (data || []).map((row) => ({
    id: row.id,
    departure_airport_icao: row.departure_airport_icao,
    arrival_airport_icao: row.arrival_airport_icao,
    departure_location_type: row.departure_location_type,
    arrival_location_type: row.arrival_location_type,
    departure_corridor: row.departure_corridor,
    arrival_corridor: row.arrival_corridor,
    departure_location_raw: row.departure_location_raw,
    arrival_location_raw: row.arrival_location_raw,
    departure_date_start: row.departure_date_start,
    departure_date_end: row.departure_date_end,
    aircraft_model: row.aircraft_model,
    aircraft_category: row.aircraft_category,
    aircraft_type_id: row.aircraft_type_id,
    price: row.price,
    price_currency: row.price_currency,
    last_seen_at: row.last_seen_at,
    first_seen_at: (row as any).first_seen_at ?? null,
    operator_id: (row as any).operator_id ?? null,
    origin_depth: 0,
    dest_depth: 0,
    match_label: "Exact",
    match_score: 0,
    exterior_image_path: null,
    interior_image_path: null,
  }));

  console.log("[ClientSearch] Exact query returned", results.length, "results");

  // Batch-lookup image paths for distinct aircraft_type_ids
  const typeIds = [...new Set(results.map((r) => r.aircraft_type_id).filter(Boolean))] as string[];
  if (typeIds.length > 0) {
    // Use `as any` because aircraft_type_images is not in the generated external types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: imgRows } = await (externalSupabase as any)
      .from("aircraft_type_images")
      .select("aircraft_type_id, exterior_image_path, interior_image_path")
      .in("aircraft_type_id", typeIds);

    if (imgRows) {
      type ImgRow = { aircraft_type_id: string; exterior_image_path: string | null; interior_image_path: string | null };
      const imgMap = new Map<string, ImgRow>((imgRows as ImgRow[]).map((r) => [r.aircraft_type_id, r]));
      for (const result of results) {
        if (result.aircraft_type_id) {
          const img = imgMap.get(result.aircraft_type_id);
          result.exterior_image_path = img?.exterior_image_path ?? null;
          result.interior_image_path = img?.interior_image_path ?? null;
        }
      }
    }
  }


  return results;
}

/**
 * Fetch expanded matches via RPC (slower, includes nearby airports)
 */
async function fetchExpandedMatches(
  params: ClientSearchParams,
  excludeIds: Set<string>
): Promise<ClientSearchResult[]> {
  const rpcParams = {
    p_origin_anchor_type: "airport",
    p_origin_anchor_value: params.originIcao,
    p_dest_anchor_type: "airport",
    p_dest_anchor_value: params.destIcao,
    p_limit: RESULTS_PER_PAGE,
    p_status: "active",
    p_date_start: params.dateStart,
    p_date_end: params.dateEnd,
  };

  console.log("[ClientSearch] Fetching expanded matches via RPC");

  const { data, error } = await externalSupabase.rpc(
    "search_empty_legs_expand_v2" as never,
    rpcParams as never
  );

  if (error) {
    console.error("[ClientSearch] RPC error:", error);
    const message = error.message || "Search failed";
    if (message.includes("timeout") || message.includes("canceling statement")) {
      throw new Error("Expanded search took too long. Showing exact matches only.");
    }
    throw new Error(message);
  }

  // Filter out results we already have from exact matches
  const rawResults = (data as any[]) || [];
  // Initialize exterior/interior image paths from RPC response (already included per spec)
  const allResults: ClientSearchResult[] = rawResults.map((r: any) => ({
    ...r,
    exterior_image_path: r.exterior_image_path ?? null,
    interior_image_path: r.interior_image_path ?? null,
  }));
  const newResults = allResults.filter((r) => !excludeIds.has(r.id));

  // NOTE: The RPC response does NOT include corridor/raw location fields, aircraft_type_id,
  // or first_seen_at. Hydrate all expanded results from empty_legs to get these fields.
  // We hydrate ALL results (not just those missing fields) because first_seen_at is never
  // returned by the RPC.
  const idsToHydrate = newResults.map((r) => r.id);

  if (idsToHydrate.length > 0) {
    const { data: rows, error: hydrateError } = await externalSupabase
      .from("empty_legs")
      .select(
        "id, departure_location_type, arrival_location_type, departure_corridor, arrival_corridor, departure_location_raw, arrival_location_raw, aircraft_type_id, first_seen_at"
      )
      .in("id", idsToHydrate);

    if (hydrateError) {
      // Non-fatal: we can still show Unknown, but log for debugging.
      console.warn("[ClientSearch] Failed to hydrate fields:", hydrateError);
    } else {
      const byId = new Map((rows || []).map((r) => [r.id, r] as const));
      for (const r of newResults) {
        const extra = byId.get(r.id);
        if (!extra) continue;
        r.departure_location_type = extra.departure_location_type;
        r.arrival_location_type = extra.arrival_location_type;
        r.departure_corridor = extra.departure_corridor;
        r.arrival_corridor = extra.arrival_corridor;
        r.departure_location_raw = extra.departure_location_raw;
        r.arrival_location_raw = extra.arrival_location_raw;
        r.aircraft_type_id = extra.aircraft_type_id;
        r.first_seen_at = extra.first_seen_at ?? null;
      }
    }

    // Batch-lookup image paths for distinct aircraft_type_ids (post-hydration so type IDs are resolved)
    const expandedTypeIds = [...new Set(newResults.map((r) => r.aircraft_type_id).filter(Boolean))] as string[];
    if (expandedTypeIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: imgRows } = await (externalSupabase as any)
        .from("aircraft_type_images")
        .select("aircraft_type_id, exterior_image_path, interior_image_path")
        .in("aircraft_type_id", expandedTypeIds);

      if (imgRows) {
        type ImgRow = { aircraft_type_id: string; exterior_image_path: string | null; interior_image_path: string | null };
        const imgMap = new Map<string, ImgRow>((imgRows as ImgRow[]).map((r) => [r.aircraft_type_id, r]));
        for (const r of newResults) {
          if (r.aircraft_type_id) {
            const img = imgMap.get(r.aircraft_type_id);
            r.exterior_image_path = img?.exterior_image_path ?? null;
            r.interior_image_path = img?.interior_image_path ?? null;
          }
        }
      }
    }
  }

  console.log(
    "[ClientSearch] RPC returned",
    allResults.length,
    "total,",
    newResults.length,
    "new after deduplication"
  );
  return newResults;
}

export interface TwoPhaseSearchParams extends ClientSearchParams {
  includeNearby: boolean;
}

/**
 * Two-phase search hook:
 * 1. Fast exact airport-to-airport query
 * 2. If includeNearby=true and exact < page size, also run expansion RPC
 */
export function useTwoPhaseSearch(params: TwoPhaseSearchParams | null) {
  const [expandedResults, setExpandedResults] = useState<ClientSearchResult[]>([]);
  const [expandedError, setExpandedError] = useState<Error | null>(null);
  const [isLoadingExpanded, setIsLoadingExpanded] = useState(false);

  // Phase 1: Exact matches (fast)
  const exactQuery = useQuery({
    queryKey: ["client-search-exact", params?.originIcao, params?.destIcao, params?.dateStart, params?.dateEnd],
    queryFn: async () => {
      if (!params) return [];
      return fetchExactMatches(params);
    },
    enabled: !!params,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Derive exact results directly from query data (no effect copy = no render-frame gap)
  const exactResults = exactQuery.data ?? [];

  // Reset expanded state when params change; pre-set loading if nearby is on
  useEffect(() => {
    setExpandedResults([]);
    setExpandedError(null);
    setIsLoadingExpanded(!!params?.includeNearby);
  }, [params?.originIcao, params?.destIcao, params?.dateStart, params?.dateEnd, params?.includeNearby]);

  // Phase 2: Expanded matches (if needed)
  useEffect(() => {
    if (!params?.includeNearby) {
      setExpandedResults([]);
      setIsLoadingExpanded(false);
      return;
    }

    // Only fetch expanded if exact results are loaded and fewer than page size
    if (!exactQuery.data || exactQuery.isLoading) return;
    if (exactQuery.data.length >= RESULTS_PER_PAGE) {
      console.log("[ClientSearch] Skipping expansion - have full page of exact matches");
      setIsLoadingExpanded(false);
      return;
    }

    const fetchExpanded = async () => {
      setIsLoadingExpanded(true);
      setExpandedError(null);
      try {
        const excludeIds = new Set(exactQuery.data.map((r) => r.id));
        const expanded = await fetchExpandedMatches(params, excludeIds);
        setExpandedResults(expanded);
      } catch (err) {
        console.error("[ClientSearch] Expanded search failed:", err);
        setExpandedError(err instanceof Error ? err : new Error("Expanded search failed"));
      } finally {
        setIsLoadingExpanded(false);
      }
    };

    fetchExpanded();
  }, [exactQuery.data, exactQuery.isLoading, params?.includeNearby, params?.originIcao, params?.destIcao, params?.dateStart, params?.dateEnd]);

  // Combine results: exact first, then expanded (already deduped)
  const allResults = useMemo(() => {
    return [...exactResults, ...expandedResults];
  }, [exactResults, expandedResults]);

  return {
    data: allResults,
    exactResults,
    expandedResults,
    isLoading: exactQuery.isLoading,
    isLoadingExpanded,
    error: exactQuery.error,
    expandedError,
    hasExactResults: exactResults.length > 0,
    hasExpandedResults: expandedResults.length > 0,
  };
}

/**
 * Hook for paginated client search with load-more capability
 * @deprecated Use useTwoPhaseSearch instead
 */
export function useClientSearchPaginated(params: ClientSearchParams | null) {
  const [allResults, setAllResults] = useState<ClientSearchResult[]>([]);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Fetch function for expansion RPC
  const fetchSearchPage = async (offset: number): Promise<ClientSearchResult[]> => {
    if (!params) return [];
    
    const rpcParams = {
      p_origin_anchor_type: "airport",
      p_origin_anchor_value: params.originIcao,
      p_dest_anchor_type: "airport",
      p_dest_anchor_value: params.destIcao,
      p_limit: RESULTS_PER_PAGE,
      p_offset: offset,
      p_status: "active",
      p_date_start: params.dateStart,
      p_date_end: params.dateEnd,
    };

    const { data, error } = await externalSupabase.rpc(
      "search_empty_legs_expand_v1" as never,
      rpcParams as never
    );

    if (error) {
      const message = error.message || "Search failed";
      if (message.includes("timeout") || message.includes("canceling statement")) {
        throw new Error("Search took too long. Try a more specific date range or different airports.");
      }
      throw new Error(message);
    }

    return (data as ClientSearchResult[]) || [];
  };

  // Initial search query
  const initialQuery = useQuery({
    queryKey: ["client-search", params, "initial"],
    queryFn: async () => {
      if (!params) return [];
      return fetchSearchPage(0);
    },
    enabled: !!params,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Reset state when params change
  useEffect(() => {
    if (params) {
      setAllResults([]);
      setCurrentOffset(0);
      setHasMore(false);
    }
  }, [params?.originIcao, params?.destIcao, params?.dateStart, params?.dateEnd]);

  // Update allResults when initial query completes
  useEffect(() => {
    if (initialQuery.data) {
      setAllResults(initialQuery.data);
      setCurrentOffset(initialQuery.data.length);
      setHasMore(initialQuery.data.length === RESULTS_PER_PAGE);
    }
  }, [initialQuery.data]);

  // Load more function
  const loadMore = useCallback(async () => {
    if (!params || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const newResults = await fetchSearchPage(currentOffset);
      setAllResults((prev) => [...prev, ...newResults]);
      setCurrentOffset((prev) => prev + newResults.length);
      setHasMore(newResults.length === RESULTS_PER_PAGE);
    } catch (error) {
      console.error("[ClientSearch] Load more error:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [params, currentOffset, isLoadingMore, hasMore]);

  return {
    data: allResults,
    isLoading: initialQuery.isLoading,
    error: initialQuery.error,
    hasMore,
    isLoadingMore,
    loadMore,
    totalLoaded: allResults.length,
  };
}

// Keep the old hook for backward compatibility but mark as deprecated
/**
 * @deprecated Use useTwoPhaseSearch instead
 */
export function useClientSearchQuery(params: ClientSearchParams | null) {
  return useQuery({
    queryKey: ["client-search", params],
    queryFn: async () => {
      if (!params) return [];
      return fetchExactMatches(params);
    },
    enabled: !!params,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

export type MatchSection = "exact" | "nearby" | "wider";

/**
 * Categorize a result into a section
 */
export function categorizeResult(result: ClientSearchResult): MatchSection {
  if (result.origin_depth === 0 && result.dest_depth === 0) {
    return "exact";
  }
  if (result.match_score <= 2) {
    return "nearby";
  }
  return "wider";
}

/**
 * Sort results: match_score asc, then last_seen_at desc
 */
export function sortResults(results: ClientSearchResult[]): ClientSearchResult[] {
  return [...results].sort((a, b) => {
    if (a.match_score !== b.match_score) {
      return a.match_score - b.match_score;
    }
    return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
  });
}

/**
 * Group and sort results by section
 */
export function groupAndSortResults(
  results: ClientSearchResult[],
  includeNearby: boolean
): { section: MatchSection; results: ClientSearchResult[] }[] {
  // Filter to exact only if nearby is disabled
  let filtered = results;
  if (!includeNearby) {
    filtered = results.filter(
      (r) => r.origin_depth === 0 && r.dest_depth === 0
    );
  }

  const sorted = sortResults(filtered);

  // Group by section
  const exact: ClientSearchResult[] = [];
  const nearby: ClientSearchResult[] = [];
  const wider: ClientSearchResult[] = [];

  for (const result of sorted) {
    const section = categorizeResult(result);
    if (section === "exact") exact.push(result);
    else if (section === "nearby") nearby.push(result);
    else wider.push(result);
  }

  const groups: { section: MatchSection; results: ClientSearchResult[] }[] = [];
  if (exact.length > 0) groups.push({ section: "exact", results: exact });
  if (nearby.length > 0) groups.push({ section: "nearby", results: nearby });
  if (wider.length > 0) groups.push({ section: "wider", results: wider });

  return groups;
}

/**
 * Flatten grouped results for pagination
 */
export interface FlattenedResult {
  type: "header" | "result";
  section?: MatchSection;
  result?: ClientSearchResult;
}

export function flattenGroupedResults(
  groups: { section: MatchSection; results: ClientSearchResult[] }[]
): FlattenedResult[] {
  const flat: FlattenedResult[] = [];
  for (const group of groups) {
    flat.push({ type: "header", section: group.section });
    for (const result of group.results) {
      flat.push({ type: "result", section: group.section, result });
    }
  }
  return flat;
}

/**
 * Paginate flattened results while preserving section headers
 */
export function paginateFlattenedResults(
  flattened: FlattenedResult[],
  page: number,
  pageSize: number
): { items: FlattenedResult[]; totalPages: number; totalResults: number } {
  // Count only result items for pagination
  const resultItems = flattened.filter((f) => f.type === "result");
  const totalResults = resultItems.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));

  // Find which results belong to the current page
  const startIdx = (page - 1) * pageSize;
  const endIdx = startIdx + pageSize;

  const pageResultIds = new Set(
    resultItems.slice(startIdx, endIdx).map((r) => r.result?.id)
  );

  // Build the page items with headers for sections that have results on this page
  const items: FlattenedResult[] = [];
  let currentSection: MatchSection | null = null;

  for (const item of flattened) {
    if (item.type === "header") {
      currentSection = item.section!;
    } else if (item.type === "result" && pageResultIds.has(item.result?.id)) {
      // Add header if this is first result of this section on this page
      if (
        currentSection &&
        !items.some((i) => i.type === "header" && i.section === currentSection)
      ) {
        items.push({ type: "header", section: currentSection });
      }
      items.push(item);
    }
  }

  return { items, totalPages, totalResults };
}
