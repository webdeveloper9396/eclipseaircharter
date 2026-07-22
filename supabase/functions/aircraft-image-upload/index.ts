import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth: verify JWT and check admin role ---
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

    // Verify user identity
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
      console.error("[aircraft-image-upload] JWT validation error:", jwtError);
      return new Response(
        JSON.stringify({ error: "Unauthorized – invalid or expired token" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const userId = claimsData.claims.sub as string;

    // Check admin role using service role client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin");

    if (rolesError || !roles || roles.length === 0) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // --- Parse multipart form data ---
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Invalid form data" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const aircraft_type_id = formData.get("aircraft_type_id") as string | null;
    const slot = formData.get("slot") as string | null;
    const file = formData.get("file") as File | null;

    // Validate inputs
    if (!aircraft_type_id || !slot || !file) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: aircraft_type_id, slot, file" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (slot !== "exterior" && slot !== "interior") {
      return new Response(
        JSON.stringify({ error: "slot must be 'exterior' or 'interior'" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(aircraft_type_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid aircraft_type_id format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // --- Connect to external DB ---
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    if (!extUrl || !extKey) {
      return new Response(
        JSON.stringify({ error: "External database configuration missing" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const extSupabase = createClient(extUrl, extKey);

    // Deterministic storage path: aircraft_types/<uuid>/exterior.jpg
    const storagePath = `aircraft_types/${aircraft_type_id}/${slot}.jpg`;

    // Read file bytes
    const fileBytes = await file.arrayBuffer();

    // --- Upload to external storage bucket ---
    const { error: uploadError } = await extSupabase.storage
      .from("aircraft-type-images")
      .upload(storagePath, fileBytes, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("[aircraft-image-upload] Storage upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: `Upload failed: ${uploadError.message}` }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // --- Fetch current image paths to preserve the other slot ---
    const { data: currentImages } = await extSupabase
      .from("aircraft_type_images")
      .select("exterior_image_path, interior_image_path")
      .eq("aircraft_type_id", aircraft_type_id)
      .maybeSingle();

    const currentExterior = currentImages?.exterior_image_path ?? null;
    const currentInterior = currentImages?.interior_image_path ?? null;

    const newExteriorPath = slot === "exterior" ? storagePath : currentExterior;
    const newInteriorPath = slot === "interior" ? storagePath : currentInterior;

    // --- Call admin RPC to update DB ---
    const { error: rpcError } = await extSupabase.rpc("admin_aircraft_type_set_images", {
      p_aircraft_type_id: aircraft_type_id,
      p_exterior_image_path: newExteriorPath,
      p_interior_image_path: newInteriorPath,
    });

    if (rpcError) {
      console.error("[aircraft-image-upload] RPC error:", rpcError);
      // File was uploaded but DB update failed — return a specific error so client can retry DB update
      return new Response(
        JSON.stringify({
          error: `Image uploaded to storage but DB update failed: ${rpcError.message}`,
          storage_path: storagePath,
          db_update_failed: true,
        }),
        { status: 207, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const publicUrl = `${extUrl}/storage/v1/object/public/aircraft-type-images/${storagePath}`;

    return new Response(
      JSON.stringify({ path: storagePath, public_url: publicUrl }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    console.error("[aircraft-image-upload] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
