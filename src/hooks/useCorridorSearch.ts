import { useQuery } from "@tanstack/react-query";
import { externalSupabase } from "@/integrations/external-supabase";
import type { EmptyLeg } from "@/integrations/external-supabase/types";

export interface CorridorSearchFilters {
  fromCorridor?: string;
  fromAirport?: string;
  fromCorridorAirports?: string[]; // ICAO codes of airports in the from corridor
  toCorridor?: string;
  toAirport?: string;
  toCorridorAirports?: string[]; // ICAO codes of airports in the to corridor
  dateStart?: string; // ISO date string
  dateEnd?: string;   // ISO date string
}

export interface CorridorSearchResult extends EmptyLeg {
  aircraft_type?: {
    manufacturer: string;
    model: string;
    category?: {
      id: string;
      display_name: string;
    } | null;
  } | null;
  operator?: {
    name: string;
  } | null;
}

export function useCorridorSearch(filters: CorridorSearchFilters) {
  const hasFilters = !!(filters.fromCorridor || filters.fromAirport || 
                     filters.toCorridor || filters.toAirport ||
                     filters.dateStart || filters.dateEnd);

  return useQuery<CorridorSearchResult[], Error>({
    queryKey: ["external", "corridor_search", filters],
    queryFn: async (): Promise<CorridorSearchResult[]> => {
      let query = externalSupabase
        .from("empty_legs")
        .select(`
          *,
          aircraft_type:aircraft_types!aircraft_type_id (
            manufacturer,
            model,
            category:aircraft_categories!category_id (
              id,
              display_name
            )
          ),
          operator:operators!operator_id (
            name
          )
        `)
        .eq("status", "active")
        .order("departure_date_start", { ascending: true })
        .limit(100);

      // From filters: match corridor name OR any airport in that corridor
      if (filters.fromCorridor) {
        const corridorAirports = filters.fromCorridorAirports || [];
        if (corridorAirports.length > 0) {
          // Match either departure_corridor contains the tag OR departure_airport is in the corridor
          query = query.or(
            `departure_corridor.ilike.%${filters.fromCorridor}%,departure_airport_icao.in.(${corridorAirports.join(",")})`
          );
        } else {
          // Fallback to just corridor match if no airports loaded yet
          query = query.ilike("departure_corridor", `%${filters.fromCorridor}%`);
        }
      } else if (filters.fromAirport) {
        query = query.eq("departure_airport_icao", filters.fromAirport);
      }

      // To filters: match corridor name OR any airport in that corridor
      if (filters.toCorridor) {
        const corridorAirports = filters.toCorridorAirports || [];
        if (corridorAirports.length > 0) {
          query = query.or(
            `arrival_corridor.ilike.%${filters.toCorridor}%,arrival_airport_icao.in.(${corridorAirports.join(",")})`
          );
        } else {
          query = query.ilike("arrival_corridor", `%${filters.toCorridor}%`);
        }
      } else if (filters.toAirport) {
        query = query.eq("arrival_airport_icao", filters.toAirport);
      }

      // Date range filters
      if (filters.dateStart) {
        query = query.gte("departure_date_start", filters.dateStart);
      }
      if (filters.dateEnd) {
        query = query.lte("departure_date_start", filters.dateEnd);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CorridorSearchResult[];
    },
    enabled: hasFilters,
    staleTime: 30 * 1000,
  });
}
