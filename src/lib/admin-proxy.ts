import { supabase } from "@/integrations/supabase/client";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/external-admin-proxy`;

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}

async function handleResponse(res: Response) {
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || `Request failed with status ${res.status}`);
  }
  return json.data;
}

/**
 * Call an admin RPC on the external database through the authenticated proxy.
 */
export async function adminRpc<T = unknown>(
  rpcName: string,
  rpcParams?: Record<string, unknown>
): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "rpc",
      rpc_name: rpcName,
      rpc_params: rpcParams || {},
    }),
  });
  return handleResponse(res) as Promise<T>;
}

/**
 * Update a row in an allowed table on the external database through the proxy.
 */
export async function adminTableUpdate<T = unknown>(
  table: string,
  id: string,
  updates: Record<string, unknown>
): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action: "update",
      table,
      id,
      updates,
    }),
  });
  return handleResponse(res) as Promise<T>;
}

// ===== Admin-safe SELECT (proxied through external-admin-proxy) =====

export type AdminFilterOp =
  | "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "ilike" | "like" | "is";

export interface AdminFilter {
  col: string;
  op: AdminFilterOp;
  value: unknown;
  negate?: boolean;
}

export interface AdminOrder {
  column: string;
  ascending?: boolean;
  nullsFirst?: boolean;
}

export interface AdminSelectSpec {
  table: string;
  columns?: string;
  filters?: AdminFilter[];
  or?: string;
  order?: AdminOrder[];
  limit?: number;
  range?: [number, number];
  count?: "exact";
  single?: "maybe" | "one";
}

export interface AdminSelectResult<T> {
  data: T;
  count: number | null;
}

/**
 * Server-side SELECT against the external DB via the admin proxy.
 * Returns { data, count }. Admin-only.
 */
export async function adminSelect<T = unknown>(
  spec: AdminSelectSpec
): Promise<AdminSelectResult<T>> {
  const headers = await getAuthHeaders();
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ action: "select", spec }),
  });
  return (await handleResponse(res)) as AdminSelectResult<T>;
}

