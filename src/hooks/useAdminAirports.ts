import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminRpc } from "@/lib/admin-proxy";

export { useAdminSearchAirports, useSearchableAirports, useAirportsByIcaos } from "@/hooks/useClientSearch";

export interface AdminUpsertAirportParams {
  p_icao: string;
  p_iata?: string | null;
  p_name?: string | null;
  p_city?: string | null;
  p_state?: string | null;
  p_country?: string | null;
  p_latitude?: number | null;
  p_longitude?: number | null;
  p_admin_rank?: number | null;
  p_admin_exclude_from_search?: boolean | null;
  p_search_city_override?: string | null;
}

export interface AdminUpsertAirportResult {
  id: string;
  icao: string;
  iata: string | null;
  name: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  admin_rank: number | null;
  admin_exclude_from_search: boolean;
  search_city_override: string | null;
}

/**
 * Mutation hook for upserting an airport via admin_upsert_airport_v1 RPC (proxied)
 */
export function useAdminUpsertAirport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AdminUpsertAirportParams): Promise<AdminUpsertAirportResult> => {
      return adminRpc<AdminUpsertAirportResult>('admin_upsert_airport_v1', params as unknown as Record<string, unknown>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external", "admin-search-airports"] });
      queryClient.invalidateQueries({ queryKey: ["external", "airports"] });
      queryClient.invalidateQueries({ queryKey: ["external", "airports-search"] });
    },
  });
}
