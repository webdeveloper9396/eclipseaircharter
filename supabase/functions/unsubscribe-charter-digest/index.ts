import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function page(title: string, body: string, ok = true): Response {
  const color = ok ? "#1d6fd8" : "#b91c1c";
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#222;">
  <div style="max-width:520px;margin:80px auto;background:#fff;border-radius:8px;padding:40px 32px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
    <h1 style="margin:0 0 12px 0;font-size:22px;color:${color};">${title}</h1>
    <p style="margin:0;font-size:14px;color:#444;line-height:1.5;">${body}</p>
    <p style="margin:32px 0 0 0;font-size:12px;color:#888;">© ${new Date().getFullYear()} Eclipse Air Charter</p>
  </div>
</body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders } });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return page("Invalid link", "This unsubscribe link is missing a token.", false);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .from("charter_digest_subscriptions")
    .select("id, email, enabled")
    .eq("unsubscribe_token", token)
    .maybeSingle();

  if (error || !data) {
    return page("Link not found", "We couldn't find a subscription for this link. It may have already been removed.", false);
  }

  if (!data.enabled) {
    return page("Already disabled", `Charter Enquiries digest emails are already disabled for <strong>${data.email}</strong>.`);
  }

  const { error: updErr } = await supabase
    .from("charter_digest_subscriptions")
    .update({ enabled: false })
    .eq("id", data.id);

  if (updErr) {
    return page("Something went wrong", "Please try again later.", false);
  }

  return page("Emails disabled", `Charter Enquiries digest emails have been disabled for <strong>${data.email}</strong>. An admin can re-enable them at any time.`);
});

