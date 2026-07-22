import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Allowlisted RPC names that can be called through this proxy
const ALLOWED_RPCS = new Set([
  "admin_airports_batch_add_tags",
  "admin_airports_batch_remove_tags",
  "admin_airports_batch_set_admin_rank",
  "admin_airports_batch_set_exclude_from_search",
  "admin_operator_set_inventory_mode",
  "admin_operator_set_verified",
  "admin_operator_create",
  "admin_operator_alias_add",
  "admin_operator_alias_remove",
  "admin_aircraft_type_add_alias",
  "admin_aircraft_type_alias_lookup",
  "admin_aircraft_type_remove_alias",
  "create_aircraft_type",
  "admin_corridor_upsert_v2",
  "admin_corridor_set_active_v2",
  "admin_corridor_airport_upsert_v2",
  "admin_corridor_airport_remove_v2",
  "admin_corridor_validate_v1",
  "admin_upsert_airport_v1",
  "admin_search_airports_v1",
  "create_operator_source_v1",
  "update_operator_source_v1",
  "set_operator_source_enabled_v1",
  "airports_add_corridor_tags_v1",
  "airports_remove_corridor_tags_v1",
  "search_empty_legs_expand_v2",
  "admin_aircraft_type_set_images",
  "create_watch_route_v1",
  "list_watch_routes_v1",
  "set_watch_route_status_v1",
  "admin_delete_corridor_recommendation_v1",
  "watch_route_email_payload_hybrid_v1",
  "admin_clear_flyeasy_workflow_lock_v1",
  "admin_set_http_ingestion_cursor_v1",
]);

// RPCs that brokers (non-admin) are also allowed to call
const BROKER_ALLOWED_RPCS = new Set([
  "create_watch_route_v1",
  "list_watch_routes_v1",
  "set_watch_route_status_v1",
]);

// Special action: direct table update on operators
const ALLOWED_TABLE_UPDATES = new Set(["operators", "watch_routes"]);

// Admin-only read allowlist (tables AND views). Public-facing objects
// (airports, empty_legs as used by public search, aircraft_types,
// aircraft_type_images) are intentionally NOT in this list — they still
// route via the browser anon client because public search depends on them.
const ADMIN_SELECTABLE = new Set([
  "operators",
  "operator_aliases",
  "operator_sources",
  "operator_inventory_runs",
  "operator_sold_policy",
  "operator_snapshot_state",
  "system_events",
  "corridor_recommendations",
  "aircraft_categories",
  "aircraft_type_aliases",
  "corridors",
  "corridor_airports",
  "corridor_summary_v1",
  "corridor_effective_airports_v1",
  "workflow_locks",
  "ingestion_cursors",
  // empty_legs is in the allowlist for admin contexts that aggregate/join it
  // (counts, SearchAnalytics hydration). The browser anon path also still
  // reads it for public search.
  "empty_legs",
]);

const ALLOWED_FILTER_OPS = new Set([
  "eq", "neq", "gt", "gte", "lt", "lte", "in", "ilike", "like", "is",
]);

type SelectSpec = {
  table: string;
  columns?: string;
  filters?: Array<{ col: string; op: string; value: unknown; negate?: boolean }>;
  or?: string;
  order?: Array<{ column: string; ascending?: boolean; nullsFirst?: boolean }>;
  limit?: number;
  range?: [number, number];
  count?: "exact";
  single?: "maybe" | "one";
};

function isSafeIdent(s: string): boolean {
  // Allow column names, dotted refs (e.g. table.col), and embedded selects fragments
  // (which may contain newlines/whitespace). Reject semicolons and non-whitespace
  // control chars.
  if (typeof s !== "string" || s.length >= 4000) return false;
  if (s.includes(";")) return false;
  // Disallow control chars except tab/newline/carriage return.
  return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s);
}

function applySelect(client: ReturnType<typeof createClient>, spec: SelectSpec) {
  const { table, columns, filters, or: orFilter, order, limit, range, count, single } = spec;

  if (!isSafeIdent(table) || !ADMIN_SELECTABLE.has(table)) {
    throw new Error(`Table not allowed for admin select: ${table}`);
  }

  const selectExpr = columns ?? "*";
  if (!isSafeIdent(selectExpr)) throw new Error("Invalid columns expression");

  // deno-lint-ignore no-explicit-any
  let q: any = client.from(table).select(selectExpr, count ? { count } : undefined);

  if (filters && Array.isArray(filters)) {
    for (const f of filters) {
      if (!f || !isSafeIdent(f.col) || !ALLOWED_FILTER_OPS.has(f.op)) {
        throw new Error(`Invalid filter: ${JSON.stringify(f)}`);
      }
      if (f.negate) {
        q = q.not(f.col, f.op, f.value);
      } else {
        // deno-lint-ignore no-explicit-any
        q = (q as any)[f.op](f.col, f.value);
      }
    }
  }

  if (orFilter) {
    if (!isSafeIdent(orFilter)) throw new Error("Invalid or() filter");
    q = q.or(orFilter);
  }

  if (order && Array.isArray(order)) {
    for (const o of order) {
      if (!isSafeIdent(o.column)) throw new Error("Invalid order column");
      q = q.order(o.column, {
        ascending: o.ascending ?? true,
        nullsFirst: o.nullsFirst,
      });
    }
  }

  if (typeof limit === "number" && limit > 0 && limit <= 5000) {
    q = q.limit(limit);
  }

  if (range && Array.isArray(range) && range.length === 2) {
    q = q.range(range[0], range[1]);
  }

  if (single === "maybe") q = q.maybeSingle();
  else if (single === "one") q = q.single();

  return q;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    let claimsData;
    try {
      const result = await supabaseAuth.auth.getClaims(token);
      if (result.error || !result.data?.claims) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      claimsData = result.data;
    } catch (jwtError) {
      console.error("[external-admin-proxy] JWT validation error:", jwtError);
      return new Response(
        JSON.stringify({ error: "Unauthorized – invalid or expired token" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const userId = claimsData.claims.sub as string;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const userRoles = (roles || []).map((r: { role: string }) => r.role);
    const isAdmin = userRoles.includes("admin");

    if (rolesError || userRoles.length === 0) {
      return new Response(
        JSON.stringify({ error: "Access denied – no roles assigned" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const body = await req.json();
    const { action, rpc_name, rpc_params, table, id, updates } = body;

    if (!isAdmin) {
      if (action !== "rpc" || !BROKER_ALLOWED_RPCS.has(rpc_name)) {
        return new Response(
          JSON.stringify({ error: "Admin access required" }),
          { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    if (!extUrl || !extKey) {
      return new Response(
        JSON.stringify({ error: "External database configuration missing" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const extSupabase = createClient(extUrl, extKey);

    if (action === "rpc") {
      if (!rpc_name || !ALLOWED_RPCS.has(rpc_name)) {
        return new Response(
          JSON.stringify({ error: `RPC not allowed: ${rpc_name}` }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const { data, error } = await extSupabase.rpc(rpc_name, rpc_params || {});
      if (error) {
        console.error(`[external-admin-proxy] RPC ${rpc_name} error:`, error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      return new Response(
        JSON.stringify({ data }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (action === "select") {
      try {
        const spec = body.spec as SelectSpec;
        if (!spec || typeof spec !== "object") {
          return new Response(
            JSON.stringify({ error: "Missing select spec" }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        const q = applySelect(extSupabase, spec);
        const { data, error, count } = await q;
        if (error) {
          console.error(`[external-admin-proxy] SELECT ${spec.table} error:`, error);
          return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        return new Response(
          JSON.stringify({ data: { data, count: count ?? null } }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    if (action === "update") {
      if (!table || !ALLOWED_TABLE_UPDATES.has(table)) {
        return new Response(
          JSON.stringify({ error: `Table update not allowed: ${table}` }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      if (!id || !updates || typeof updates !== "object") {
        return new Response(
          JSON.stringify({ error: "Missing id or updates" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const { data, error } = await extSupabase
        .from(table)
        .update(updates)
        .eq("id", id)
        .select()
        .maybeSingle();

      if (error) {
        console.error(`[external-admin-proxy] UPDATE ${table} error:`, error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      return new Response(
        JSON.stringify({ data }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (action === "reset_watch_route_alerted") {
      const watchRouteId = body.watch_route_id;
      if (!watchRouteId) {
        return new Response(
          JSON.stringify({ error: "Missing watch_route_id" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      const { error } = await extSupabase
        .from("watch_route_alerted_legs")
        .delete()
        .eq("watch_route_id", watchRouteId);
      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      return new Response(
        JSON.stringify({ data: { ok: true } }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action." }),
      { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    console.error("[external-admin-proxy] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
