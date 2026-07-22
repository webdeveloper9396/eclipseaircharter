import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin");
    if (!roles || roles.length === 0) return json({ error: "Admin access required" }, 403);

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = (body.action as string) || "list";

    if (action === "list") {
      const { data, error } = await admin
        .from("charter_digest_subscriptions")
        .select("id, email, enabled, last_sent_at, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return json({ ok: true, subscriptions: data ?? [] });
    }

    if (action === "add") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return json({ error: "Invalid email" }, 400);
      }
      const { data, error } = await admin
        .from("charter_digest_subscriptions")
        .upsert({ email, enabled: true }, { onConflict: "email" })
        .select()
        .single();
      if (error) throw error;
      return json({ ok: true, subscription: data });
    }

    if (action === "toggle") {
      const id = String(body.id || "");
      const enabled = Boolean(body.enabled);
      if (!id) return json({ error: "Missing id" }, 400);
      const { data, error } = await admin
        .from("charter_digest_subscriptions")
        .update({ enabled })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return json({ ok: true, subscription: data });
    }

    if (action === "remove") {
      const id = String(body.id || "");
      if (!id) return json({ error: "Missing id" }, 400);
      const { error } = await admin
        .from("charter_digest_subscriptions")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("[manage-charter-digest] Error:", err);
    return json({ error: String(err) }, 500);
  }
});
