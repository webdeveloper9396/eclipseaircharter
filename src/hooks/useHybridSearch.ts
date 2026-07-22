import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/integrations/external-supabase";
import type { ClientSearchResult } from "./useClientSearch";

export interface HybridSearchParams {
  originIcao: string;
  destIcao: string;
  dateStart: string;
  dateEnd: string;
  includeNearby: boolean;
}

export interface RadiusSearchResult extends ClientSearchResult {
  origin_reposition_nm: number | null;
  dest_reposition_nm: number | null;
  total_reposition_nm: number | null;
}

export type HybridResult = ClientSearchResult & {
  _source: "corridor" | "radius";
  origin_reposition_nm?: number | null;
  dest_reposition_nm?: number | null;
  total_reposition_nm?: number | null;
};

export type HybridSection = "exact" | "nearby_airports" | "same_area" | "wider";

/**
 * Categorize a hybrid result into a section.
 *
 * - Exact: corridor results with origin_depth=0 AND dest_depth=0
 * - Nearby Airports: ALL radius results
 * - Same Area: corridor results with match_label='Same area' (excluding exact)
 * - Wider: corridor results with match_label='Wider area'
 */
export function categorizeHybridResult(r: HybridResult): HybridSection {
  if (r._source === "radius") return "nearby_airports";
  if (r.origin_depth === 0 && r.dest_depth === 0) return "exact";
  if (r.match_label === "Same area") return "same_area";
  return "wider";
}

export function groupHybridResults(
  results: HybridResult[],
  includeNearby: boolean
): { section: HybridSection; results: HybridResult[] }[] {
  const exact: HybridResult[] = [];
  const nearbyAirports: HybridResult[] = [];
  const sameArea: HybridResult[] = [];
  const wider: HybridResult[] = [];

  for (const r of results) {
    const section = categorizeHybridResult(r);
    if (section === "exact") exact.push(r);
    else if (section === "nearby_airports") nearbyAirports.push(r);
    else if (section === "same_area") sameArea.push(r);
    else wider.push(r);
  }

  // Sort exact/same_area/wider: match_score asc, then last_seen_at desc
  const defaultSortFn = (a: HybridResult, b: HybridResult) => {
    if (a.match_score !== b.match_score) return a.match_score - b.match_score;
    return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
  };

  // Nearby Airports: total_reposition_nm asc, greatest(origin, dest) asc, last_seen_at desc
  const nearbyAirportsSortFn = (a: HybridResult, b: HybridResult) => {
    const aTotalDist = a.total_reposition_nm ?? Infinity;
    const bTotalDist = b.total_reposition_nm ?? Infinity;
    if (aTotalDist !== bTotalDist) return aTotalDist - bTotalDist;
    const aMaxLeg = Math.max(a.origin_reposition_nm ?? Infinity, a.dest_reposition_nm ?? Infinity);
    const bMaxLeg = Math.max(b.origin_reposition_nm ?? Infinity, b.dest_reposition_nm ?? Infinity);
    if (aMaxLeg !== bMaxLeg) return aMaxLeg - bMaxLeg;
    return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
  };

  exact.sort(defaultSortFn);
  nearbyAirports.sort(nearbyAirportsSortFn);
  sameArea.sort(defaultSortFn);
  wider.sort(defaultSortFn);

  const groups: { section: HybridSection; results: HybridResult[] }[] = [];
  if (exact.length > 0) groups.push({ section: "exact", results: exact });
  if (includeNearby && nearbyAirports.length > 0) groups.push({ section: "nearby_airports", results: nearbyAirports });
  if (sameArea.length > 0) groups.push({ section: "same_area", results: sameArea });
  if (wider.length > 0) groups.push({ section: "wider", results: wider });

  return groups;
}

/** Hydrate corridor results with location/image data from empty_legs */
async function hydrateResults(results: ClientSearchResult[]): Promise<void> {
  if (results.length === 0) return;

  const ids = results.map((r) => r.id);
  const { data: rows } = await externalSupabase
    .from("empty_legs")
    .select(
      "id, departure_location_type, arrival_location_type, departure_corridor, arrival_corridor, departure_location_raw, arrival_location_raw, aircraft_type_id, first_seen_at, operator_id"
    )
    .in("id", ids) as { data: any[] | null };

  if (rows) {
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    for (const r of results) {
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
      r.operator_id = extra.operator_id ?? null;
    }
  }

  // Batch-lookup image paths
  const typeIds = [...new Set(results.map((r) => r.aircraft_type_id).filter(Boolean))] as string[];
  if (typeIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: imgRows } = await (externalSupabase as any)
      .from("aircraft_type_images")
      .select("aircraft_type_id, exterior_image_path, interior_image_path")
      .in("aircraft_type_id", typeIds);

    if (imgRows) {
      type ImgRow = { aircraft_type_id: string; exterior_image_path: string | null; interior_image_path: string | null };
      const imgMap = new Map<string, ImgRow>((imgRows as ImgRow[]).map((r: ImgRow) => [r.aircraft_type_id, r]));
      for (const r of results) {
        if (r.aircraft_type_id) {
          const img = imgMap.get(r.aircraft_type_id);
          r.exterior_image_path = img?.exterior_image_path ?? null;
          r.interior_image_path = img?.interior_image_path ?? null;
        }
      }
    }
  }
}

/**
 * Hybrid search hook: corridor + radius
 */
export function useHybridSearch(params: HybridSearchParams | null) {
  const [radiusResults, setRadiusResults] = useState<HybridResult[]>([]);
  const [radiusError, setRadiusError] = useState<Error | null>(null);
  const [isLoadingRadius, setIsLoadingRadius] = useState(false);

  // Phase 1: Corridor search via search_empty_legs_expand_v2
  const corridorQuery = useQuery({
    queryKey: ["hybrid-corridor", params?.originIcao, params?.destIcao, params?.dateStart, params?.dateEnd],
    queryFn: async (): Promise<HybridResult[]> => {
      if (!params) return [];

      const { data, error } = await externalSupabase.rpc(
        "search_empty_legs_expand_v2" as never,
        {
          p_origin_anchor_type: "airport",
          p_origin_anchor_value: params.originIcao,
          p_dest_anchor_type: "airport",
          p_dest_anchor_value: params.destIcao,
          p_limit: 50,
          p_status: "active",
          p_date_start: params.dateStart,
          p_date_end: params.dateEnd,
        } as never
      );

      if (error) throw new Error(error.message || "Corridor search failed");

      const results: HybridResult[] = ((data as any[]) || []).map((r: any) => ({
        ...r,
        exterior_image_path: r.exterior_image_path ?? null,
        interior_image_path: r.interior_image_path ?? null,
        _source: "corridor" as const,
      }));

      await hydrateResults(results);
      return results;
    },
    enabled: !!params,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const corridorResults = corridorQuery.data ?? [];

  // Reset radius state when params change
  useEffect(() => {
    setRadiusResults([]);
    setRadiusError(null);
    setIsLoadingRadius(!!params?.includeNearby);
  }, [params?.originIcao, params?.destIcao, params?.dateStart, params?.dateEnd, params?.includeNearby]);

  // Phase 2: Radius search (only if includeNearby is on)
  useEffect(() => {
    if (!params?.includeNearby) {
      setRadiusResults([]);
      setIsLoadingRadius(false);
      return;
    }

    if (!corridorQuery.data || corridorQuery.isLoading) return;

    const fetchRadius = async () => {
      setIsLoadingRadius(true);
      setRadiusError(null);
      try {
        // Only exclude exact corridor matches (depth 0/0) from radius search
        // Non-exact corridor results should also appear in radius so we get reposition distances
        const exactIds = corridorQuery.data
          .filter((r) => r.origin_depth === 0 && r.dest_depth === 0)
          .map((r) => r.id);

        const { data, error } = await externalSupabase.rpc(
          "search_empty_legs_radius_v1" as never,
          {
            p_origin_icao: params.originIcao,
            p_dest_icao: params.destIcao,
            p_limit: 50,
            p_status: "active",
            p_date_start: params.dateStart,
            p_date_end: params.dateEnd,
            p_exclude_leg_ids: exactIds,
          } as never
        );

        if (error) throw new Error(error.message || "Radius search failed");

        const results: HybridResult[] = ((data as any[]) || []).map((r: any) => ({
          id: r.id,
          departure_airport_icao: r.departure_airport_icao,
          arrival_airport_icao: r.arrival_airport_icao,
          departure_location_type: r.departure_location_type ?? "airport",
          arrival_location_type: r.arrival_location_type ?? "airport",
          departure_corridor: r.departure_corridor ?? null,
          arrival_corridor: r.arrival_corridor ?? null,
          departure_location_raw: r.departure_location_raw ?? null,
          arrival_location_raw: r.arrival_location_raw ?? null,
          departure_date_start: r.departure_date_start,
          departure_date_end: r.departure_date_end,
          aircraft_model: r.aircraft_model ?? null,
          aircraft_category: r.aircraft_category ?? null,
          aircraft_type_id: r.aircraft_type_id ?? null,
          price: r.price ?? null,
          price_currency: r.price_currency ?? null,
          last_seen_at: r.last_seen_at,
          first_seen_at: r.first_seen_at ?? null,
          operator_id: r.operator_id ?? null,
          origin_depth: r.origin_depth ?? 0,
          dest_depth: r.dest_depth ?? 0,
          match_label: r.match_label ?? "Radius",
          match_score: r.match_score ?? 50,
          exterior_image_path: r.exterior_image_path ?? null,
          interior_image_path: r.interior_image_path ?? null,
          _source: "radius" as const,
          origin_reposition_nm: r.origin_reposition_nm ?? null,
          dest_reposition_nm: r.dest_reposition_nm ?? null,
          total_reposition_nm: r.total_reposition_nm ?? null,
        }));

        await hydrateResults(results);
        setRadiusResults(results);
      } catch (err) {
        console.error("[HybridSearch] Radius search failed:", err);
        setRadiusError(err instanceof Error ? err : new Error("Radius search failed"));
      } finally {
        setIsLoadingRadius(false);
      }
    };

    fetchRadius();
  }, [corridorQuery.data, corridorQuery.isLoading, params?.includeNearby, params?.originIcao, params?.destIcao, params?.dateStart, params?.dateEnd]);

  // Combine and dedupe: prefer radius version for non-exact corridor matches
  // (radius results have reposition distance data)
  const allResults = useMemo(() => {
    // Build a map of radius results by id for quick lookup
    const radiusById = new Map<string, HybridResult>();
    for (const r of radiusResults) {
      radiusById.set(r.id, r);
    }

    const seen = new Set<string>();
    const combined: HybridResult[] = [];

    // First pass: corridor results — keep exact, swap non-exact for radius version if available
    for (const r of corridorResults) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      const isExact = r.origin_depth === 0 && r.dest_depth === 0;
      const radiusVersion = radiusById.get(r.id);
      if (!isExact && radiusVersion) {
        // Prefer radius version — it has reposition distance data
        combined.push(radiusVersion);
      } else {
        combined.push(r);
      }
    }

    // Second pass: remaining radius results not seen in corridor
    for (const r of radiusResults) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        combined.push(r);
      }
    }

    return combined;
  }, [corridorResults, radiusResults]);

  return {
    data: allResults,
    corridorResults,
    radiusResults,
    isLoading: corridorQuery.isLoading,
    isLoadingRadius,
    error: corridorQuery.error,
    radiusError,
  };
}
