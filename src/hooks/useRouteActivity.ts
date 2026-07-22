import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/integrations/external-supabase";
import type { LegStatus } from "@/integrations/external-supabase/types";

/**
 * Route Activity Fallback Hook
 * 
 * This hook fetches historical activity for a route when the main search
 * returns zero results. It's designed to provide context and reduce anxiety
 * by showing that the route has activity, even if nothing matches the user's
 * specific travel window.
 * 
 * Uses the existing search_empty_legs_expand_v1 RPC with relaxed parameters
 * (no date filter, no status filter) to fetch all legs for the route.
 */

// Constants for categorization
const RECENT_SOLD_DAYS = 30;
const RECENT_EXPIRED_DAYS = 30;

export interface RouteActivityResult {
  id: string;
  departure_airport_icao: string | null;
  arrival_airport_icao: string | null;
  departure_date_start: string;
  departure_date_end: string;
  aircraft_model: string | null;
  aircraft_category: string | null;
  price: number | null;
  price_currency: string | null;
  last_seen_at: string;
  status: LegStatus;
  sold_detected_at: string | null;
  origin_depth: number;
  dest_depth: number;
  match_label: string;
  match_score: number;
  // Hydrated image paths (fetched after RPC)
  exterior_image_path?: string | null;
  interior_image_path?: string | null;
  // Hydrated from empty_legs (broker-only display)
  operator_id?: string | null;
}

export type RouteActivitySection = "sold" | "expired" | "other_dates" | "other_dates_exact" | "other_dates_similar";

export interface CategorizedRouteActivity {
  section: RouteActivitySection;
  results: RouteActivityResult[];
}

interface UseRouteActivityParams {
  originIcao: string;
  destIcao: string;
  userDateStart: string;
  userDateEnd: string;
}

/**
 * Parse a date-only string (YYYY-MM-DD) into a Date at midnight UTC
 * This avoids timezone issues when comparing date-only values
 */
function parseDateOnly(dateStr: string): Date {
  // Date-only strings should be parsed as UTC to avoid timezone shifts
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Get today's date as a Date object at midnight UTC
 * Used for consistent date-only comparisons
 */
function getTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Check if a leg overlaps with the user's selected travel window
 * 
 * Overlap condition: leg_start <= user_end AND leg_end >= user_start
 * This is the standard interval overlap check.
 * 
 * Uses date-only parsing to avoid timezone edge cases.
 */
function legOverlapsUserWindow(
  legStart: string,
  legEnd: string,
  userStart: string,
  userEnd: string
): boolean {
  const ls = parseDateOnly(legStart);
  const le = parseDateOnly(legEnd);
  const us = parseDateOnly(userStart);
  const ue = parseDateOnly(userEnd);
  
  return ls <= ue && le >= us;
}

/**
 * Check if a timestamp is within N days from now (looking backward in time)
 * Used for "recently sold" and "recently expired" checks.
 * 
 * @param timestampStr - ISO timestamp string (can include time)
 * @param days - Number of days to look back
 */
function isWithinDays(timestampStr: string, days: number): boolean {
  const date = new Date(timestampStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= days;
}

/**
 * Check if a date-only string is in the past (before today)
 * Uses UTC comparison to avoid timezone boundary issues.
 */
function isDateInPast(dateStr: string): boolean {
  const date = parseDateOnly(dateStr);
  const today = getTodayUTC();
  return date < today;
}

/**
 * Categorize and sort route activity results into sections
 */
export function categorizeRouteActivity(
  results: RouteActivityResult[],
  userDateStart: string,
  userDateEnd: string
): CategorizedRouteActivity[] {
  const sold: RouteActivityResult[] = [];
  const expired: RouteActivityResult[] = [];
  const otherDatesExact: RouteActivityResult[] = [];
  const otherDatesSimilar: RouteActivityResult[] = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const result of results) {
    // Section A: Recently sold
    if (result.status === "sold") {
      // Use sold_detected_at if available, otherwise skip (we don't want to guess)
      const soldDate = result.sold_detected_at;
      if (soldDate && isWithinDays(soldDate, RECENT_SOLD_DAYS)) {
        sold.push(result);
      }
      continue;
    }

    // Section B: Recently expired
    // Primary: status === 'expired'
    // Fallback: departure_date_end is in the past (catches legs that should be expired but status wasn't updated)
    // We also exclude active legs that are in the past from appearing here - they'll be caught below
    const hasExpiredStatus = result.status === "expired";
    const hasPassedDate = isDateInPast(result.departure_date_end);
    const isEffectivelyExpired = hasExpiredStatus || (hasPassedDate && result.status !== "active");
    
    // For active legs that have passed dates, treat them as expired
    const isActiveButPassed = result.status === "active" && hasPassedDate;
    
    if (isEffectivelyExpired || isActiveButPassed) {
      // Only include if expired recently (within RECENT_EXPIRED_DAYS)
      if (isWithinDays(result.departure_date_end, RECENT_EXPIRED_DAYS)) {
        expired.push(result);
      }
      continue;
    }

    // Section C: Other dates (active but not overlapping user's window)
    // Split into exact route matches vs nearby/wider
    if (result.status === "active") {
      const overlaps = legOverlapsUserWindow(
        result.departure_date_start,
        result.departure_date_end,
        userDateStart,
        userDateEnd
      );
      if (!overlaps) {
        const isExactRoute = result.origin_depth === 0 && result.dest_depth === 0;
        if (isExactRoute) {
          otherDatesExact.push(result);
        } else {
          otherDatesSimilar.push(result);
        }
      }
    }
  }

  // Sort each section
  // Sold: by sold_detected_at desc
  sold.sort((a, b) => {
    const dateA = a.sold_detected_at ? new Date(a.sold_detected_at).getTime() : 0;
    const dateB = b.sold_detected_at ? new Date(b.sold_detected_at).getTime() : 0;
    return dateB - dateA;
  });

  // Expired: by departure_date_end desc
  expired.sort((a, b) => {
    return new Date(b.departure_date_end).getTime() - new Date(a.departure_date_end).getTime();
  });

  // Other dates exact: by last_seen_at desc
  otherDatesExact.sort((a, b) => {
    return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
  });

  // Other dates similar: by last_seen_at desc
  otherDatesSimilar.sort((a, b) => {
    return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
  });

  // Limit sold and expired to maximum 3 results each
  const limitedSold = sold.slice(0, 3);
  const limitedExpired = expired.slice(0, 3);

  const sections: CategorizedRouteActivity[] = [];
  if (otherDatesExact.length > 0) sections.push({ section: "other_dates_exact", results: otherDatesExact });
  if (otherDatesSimilar.length > 0) sections.push({ section: "other_dates_similar", results: otherDatesSimilar });
  if (limitedSold.length > 0) sections.push({ section: "sold", results: limitedSold });
  if (limitedExpired.length > 0) sections.push({ section: "expired", results: limitedExpired });

  return sections;
}

/**
 * Map raw RPC result to minimal view-model
 * Discards unused fields to reduce memory footprint
 */
function mapToViewModel(raw: Record<string, unknown>): RouteActivityResult {
  return {
    id: raw.id as string,
    departure_airport_icao: raw.departure_airport_icao as string | null,
    arrival_airport_icao: raw.arrival_airport_icao as string | null,
    departure_date_start: raw.departure_date_start as string,
    departure_date_end: raw.departure_date_end as string,
    aircraft_model: raw.aircraft_model as string | null,
    aircraft_category: raw.aircraft_category as string | null,
    price: raw.price as number | null,
    price_currency: raw.price_currency as string | null,
    last_seen_at: raw.last_seen_at as string,
    status: raw.status as LegStatus,
    sold_detected_at: raw.sold_detected_at as string | null,
    origin_depth: raw.origin_depth as number,
    dest_depth: raw.dest_depth as number,
    match_label: raw.match_label as string,
    match_score: raw.match_score as number,
  };
}

/**
 * Map a radius RPC row to the RouteActivityResult shape.
 * Radius results are active-only and represent nearby-airport matches —
 * we surface them as `other_dates_similar` (depth >0) when their dates
 * fall outside the user's selected window.
 */
function mapRadiusToViewModel(raw: Record<string, unknown>): RouteActivityResult {
  return {
    id: raw.id as string,
    departure_airport_icao: (raw.departure_airport_icao as string | null) ?? null,
    arrival_airport_icao: (raw.arrival_airport_icao as string | null) ?? null,
    departure_date_start: raw.departure_date_start as string,
    departure_date_end: raw.departure_date_end as string,
    aircraft_model: (raw.aircraft_model as string | null) ?? null,
    aircraft_category: (raw.aircraft_category as string | null) ?? null,
    price: (raw.price as number | null) ?? null,
    price_currency: (raw.price_currency as string | null) ?? null,
    last_seen_at: raw.last_seen_at as string,
    status: "active" as LegStatus,
    sold_detected_at: null,
    // Force non-exact so the categorizer routes these to `other_dates_similar`
    origin_depth: (raw.origin_depth as number | undefined) ?? 1,
    dest_depth: (raw.dest_depth as number | undefined) ?? 1,
    match_label: (raw.match_label as string | undefined) ?? "Nearby airport",
    match_score: (raw.match_score as number | undefined) ?? 50,
  };
}

/**
 * Fetch route activity data.
 *
 * Runs two queries in parallel against the same date window:
 *   1. Corridor RPC (search_empty_legs_route_activity_v1) — all statuses, depth-aware.
 *      Feeds: other_dates_exact, other_dates_similar (corridor), sold, expired.
 *   2. Radius RPC (search_empty_legs_radius_v1) — active only, nearby airports.
 *      Feeds: other_dates_similar (nearby airports).
 *
 * Results are merged and de-duplicated by id, preferring the corridor row
 * (which carries true depth + sold/expired status). Hydrates aircraft images.
 */
async function fetchRouteActivity(
  originIcao: string,
  destIcao: string
): Promise<RouteActivityResult[]> {
  console.log("[RouteActivity] Fetching activity for:", originIcao, "->", destIcao);

  // Bound the date window so the planner can use the date index.
  // Same window as useHybridSearch / main search.
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const dateStart = new Date(today);
  dateStart.setDate(dateStart.getDate() - 7);
  const dateEnd = new Date(today);
  dateEnd.setDate(dateEnd.getDate() + 60);
  const dateStartStr = fmt(dateStart);
  const dateEndStr = fmt(dateEnd);

  const corridorParams = {
    p_origin_anchor_type: "airport",
    p_origin_anchor_value: originIcao,
    p_dest_anchor_type: "airport",
    p_dest_anchor_value: destIcao,
    p_limit: 100,
    p_status: null,
    p_date_start: dateStartStr,
    p_date_end: dateEndStr,
  };

  const radiusParams = {
    p_origin_icao: originIcao,
    p_dest_icao: destIcao,
    p_limit: 50,
    p_status: "active",
    p_date_start: dateStartStr,
    p_date_end: dateEndStr,
    p_exclude_leg_ids: [] as string[],
  };

  const [corridorRes, radiusRes] = await Promise.all([
    externalSupabase.rpc("search_empty_legs_route_activity_v1" as never, corridorParams as never),
    Promise.resolve(
      externalSupabase.rpc("search_empty_legs_radius_v1" as never, radiusParams as never)
    ).catch((err) => {
      // Radius is additive — failure should not break Route Activity.
      console.warn("[RouteActivity] Radius RPC failed (non-fatal):", err);
      return { data: null, error: null } as { data: unknown; error: null };
    }),
  ]);

  if (corridorRes.error) {
    console.error("[RouteActivity] Corridor RPC error:", corridorRes.error);
    throw new Error(corridorRes.error.message || "Failed to fetch route activity");
  }

  const corridorRaw = (corridorRes.data as Record<string, unknown>[]) || [];
  const radiusRaw = (radiusRes?.data as Record<string, unknown>[] | null) || [];
  console.log(
    "[RouteActivity] Fetched corridor:",
    corridorRaw.length,
    "radius:",
    radiusRaw.length
  );

  const corridorResults = corridorRaw.map(mapToViewModel);
  const seen = new Set(corridorResults.map((r) => r.id));
  const radiusResults = radiusRaw
    .map(mapRadiusToViewModel)
    .filter((r) => !seen.has(r.id));

  const results = [...corridorResults, ...radiusResults];

  // Hydrate aircraft image paths
  try {
    const ids = results.map((r) => r.id);
    if (ids.length === 0) return results;

    // Step 1: Get aircraft_type_id and operator_id for each leg
    const { data: legRows } = await externalSupabase
      .from("empty_legs")
      .select("id, aircraft_type_id, operator_id")
      .in("id", ids);

    const legTypeMap = new Map<string, string>();
    const legOperatorMap = new Map<string, string>();
    for (const row of legRows || []) {
      if (row.aircraft_type_id) legTypeMap.set(row.id, row.aircraft_type_id);
      if ((row as { operator_id?: string | null }).operator_id) {
        legOperatorMap.set(row.id, (row as { operator_id: string }).operator_id);
      }
    }

    const typeIds = [...new Set(legTypeMap.values())];

    const imgMap = new Map<string, { exterior_image_path: string | null; interior_image_path: string | null }>();
    if (typeIds.length > 0) {
      // Step 2: Get image paths for those aircraft types
      const { data: imgRows } = await externalSupabase
        .from("aircraft_type_images")
        .select("aircraft_type_id, exterior_image_path, interior_image_path")
        .in("aircraft_type_id", typeIds);

      for (const row of imgRows || []) {
        imgMap.set(row.aircraft_type_id, {
          exterior_image_path: row.exterior_image_path,
          interior_image_path: row.interior_image_path,
        });
      }
    }

    // Step 3: Merge image paths + operator_id into results
    return results.map((r) => {
      const typeId = legTypeMap.get(r.id);
      const imgs = typeId ? imgMap.get(typeId) : undefined;
      return {
        ...r,
        exterior_image_path: imgs?.exterior_image_path ?? null,
        interior_image_path: imgs?.interior_image_path ?? null,
        operator_id: legOperatorMap.get(r.id) ?? null,
      };
    });
  } catch (imgError) {
    console.warn("[RouteActivity] Image hydration failed:", imgError);
    return results;
  }
}

/**
 * Hook for fetching and categorizing route activity
 * Only enabled when explicitly triggered (user clicks CTA)
 */
export function useRouteActivity(
  params: UseRouteActivityParams | null,
  enabled: boolean
) {
  const query = useQuery({
    queryKey: ["route-activity", params?.originIcao, params?.destIcao],
    queryFn: async () => {
      if (!params) return [];
      return fetchRouteActivity(params.originIcao, params.destIcao);
    },
    enabled: enabled && !!params,
    staleTime: 60 * 1000, // Cache for 1 minute
    refetchOnWindowFocus: false,
    retry: 2,
    retryDelay: (attempt) => 400 * (attempt + 1),
  });

  // Categorize results when available
  const categorizedResults = useMemo(() => {
    if (!query.data || !params) return [];
    return categorizeRouteActivity(
      query.data,
      params.userDateStart,
      params.userDateEnd
    );
  }, [query.data, params?.userDateStart, params?.userDateEnd]);

  // Count totals for display
  const totalResults = useMemo(() => {
    return categorizedResults.reduce((sum, cat) => sum + cat.results.length, 0);
  }, [categorizedResults]);

  return {
    data: categorizedResults,
    rawData: query.data || [],
    totalResults,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    hasData: totalResults > 0,
    refetch: query.refetch,
  };
}
