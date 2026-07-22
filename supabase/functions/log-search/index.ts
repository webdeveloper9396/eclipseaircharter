import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();

    // Mode 2: Update result_count (and optional section counts)
    if (body.search_log_id && body.result_count !== undefined) {
      // Validate numeric payloads
      const resultCount = Number(body.result_count);
      if (!Number.isFinite(resultCount) || resultCount < 0) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid result_count" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const updateData: Record<string, unknown> = { result_count: resultCount };
      if (body.exact_count !== undefined) {
        const v = Number(body.exact_count);
        if (Number.isFinite(v) && v >= 0) updateData.exact_count = v;
      }
      if (body.nearby_count !== undefined) {
        const v = Number(body.nearby_count);
        if (Number.isFinite(v) && v >= 0) updateData.nearby_count = v;
      }
      if (body.wider_count !== undefined) {
        const v = Number(body.wider_count);
        if (Number.isFinite(v) && v >= 0) updateData.wider_count = v;
      }

      const { data, error } = await supabase
        .from("search_logs")
        .update(updateData)
        .eq("id", body.search_log_id)
        .select("id")
        .maybeSingle();

      if (error) {
        console.error("Update error:", error);
        return new Response(JSON.stringify({ ok: false, updated: false, error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // If primary update matched a row, we're done
      if (data) {
        return new Response(JSON.stringify({ ok: true, updated: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fallback: try to find the latest unsynced row by session_id + route
      if (body.session_id && body.origin_icao && body.destination_icao) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("search_logs")
          .update(updateData)
          .eq("session_id", body.session_id)
          .eq("origin_icao", body.origin_icao)
          .eq("destination_icao", body.destination_icao)
          .is("result_count", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .select("id")
          .maybeSingle();

        if (!fallbackError && fallbackData) {
          return new Response(JSON.stringify({ ok: true, updated: true, fallback: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // No row matched
      return new Response(JSON.stringify({ ok: true, updated: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mode 1: Insert new search log
    const forwarded = req.headers.get("x-forwarded-for");
    let ip = forwarded ? forwarded.split(",")[0].trim() : null;
    if (ip && ip.startsWith("::ffff:")) {
      ip = ip.slice(7);
    }

    const row = {
      origin_icao: body.origin_icao,
      destination_icao: body.destination_icao,
      origin_label: body.origin_label || null,
      destination_label: body.destination_label || null,
      date_start: body.date_start,
      date_end: body.date_end,
      include_nearby: body.include_nearby ?? true,
      session_id: body.session_id || null,
      user_agent: body.user_agent || null,
      referrer: body.referrer || null,
      ip_address: ip,
    };

    const { data, error } = await supabase
      .from("search_logs")
      .insert(row)
      .select("id")
      .single();

    if (error) {
      console.error("Insert error:", error);
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ ok: false, error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
