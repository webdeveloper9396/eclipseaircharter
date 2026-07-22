import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminRpc } from "@/lib/admin-proxy";
import { useAuth } from "@/contexts/AuthContext";

export interface WatchRoute {
  id: string;
  broker_email: string;
  broker_name: string | null;
  origin_icao: string;
  destination_icao: string;
  date_start: string;
  date_end: string;
  notes: string | null;
  status: string;
  last_checked_at: string | null;
  last_emailed_at: string | null;
  created_at: string;
}

export function useWatchRoutes() {
  const { profile, isAdmin } = useAuth();
  const email = profile?.email ?? "";

  return useQuery<WatchRoute[]>({
    queryKey: ["watch_routes", email, isAdmin],
    queryFn: async () => {
      // For admin, pass null to get all; for broker pass their email
      const brokerEmail = isAdmin ? null : email;
      return adminRpc<WatchRoute[]>("list_watch_routes_v1", {
        p_broker_email: brokerEmail,
      });
    },
    enabled: !!email,
  });
}

export function useCreateWatchRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      broker_email: string;
      broker_name: string;
      origin_icao: string;
      destination_icao: string;
      date_start: string;
      date_end: string;
      notes: string;
    }) => {
      return adminRpc<string>("create_watch_route_v1", {
        p_broker_email: params.broker_email,
        p_broker_name: params.broker_name,
        p_origin_icao: params.origin_icao,
        p_destination_icao: params.destination_icao,
        p_date_start: params.date_start,
        p_date_end: params.date_end,
        p_notes: params.notes,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["watch_routes"] });
    },
  });
}

export function useSetWatchRouteStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { watch_route_id: string; status: string }) => {
      return adminRpc("set_watch_route_status_v1", {
        p_watch_route_id: params.watch_route_id,
        p_status: params.status,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["watch_routes"] });
    },
  });
}
