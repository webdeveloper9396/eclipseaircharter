import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(d: string): string {
  if (!d) return "N/A";
  const [y, m, day] = d.substring(0, 10).split("-").map(Number);
  const dt = new Date(y, m - 1, day);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Parse body
    const body = await req.json();
    const {
      broker_email,
      broker_name,
      origin_icao,
      origin_label,
      destination_icao,
      destination_label,
      date_start,
      date_end,
      notes,
    } = body;

    if (!broker_email || !origin_icao || !destination_icao || !date_start || !date_end) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // SMTP setup
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465", 10);
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");

    if (!smtpHost || !smtpUser || !smtpPass) {
      throw new Error("SMTP configuration missing");
    }

    const dateWindow = date_start === date_end
      ? formatDate(date_start)
      : `${formatDate(date_start)} - ${formatDate(date_end)}`;

    const originDisplay = origin_label
      ? escapeHtml(origin_label).replace(/\u2014/g, "-")
      : escapeHtml(origin_icao);
    const destDisplay = destination_label
      ? escapeHtml(destination_label).replace(/\u2014/g, "-")
      : escapeHtml(destination_icao);

    const greeting = broker_name ? `Hi ${escapeHtml(broker_name)},` : "Hi,";

    const subject = `Watch Route Created: ${origin_icao} -> ${destination_icao} (${formatDate(date_start)} - ${formatDate(date_end)})`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px 24px;">

<h2 style="margin:0 0 8px;color:#222;">Watch Route Confirmed</h2>
<p style="margin:0 0 24px;color:#555;font-size:15px;">${greeting} your watch route has been created and is now active.</p>

<table style="border-collapse:collapse;width:100%;margin-bottom:24px;border:1px solid #e5e5e5;border-radius:6px;">
  <tr style="background:#fafafa;">
    <td style="padding:10px 14px;color:#666;font-size:13px;border-bottom:1px solid #e5e5e5;width:140px;">Origin</td>
    <td style="padding:10px 14px;font-size:14px;border-bottom:1px solid #e5e5e5;font-weight:600;">${originDisplay}</td>
  </tr>
  <tr>
    <td style="padding:10px 14px;color:#666;font-size:13px;border-bottom:1px solid #e5e5e5;">Destination</td>
    <td style="padding:10px 14px;font-size:14px;border-bottom:1px solid #e5e5e5;font-weight:600;">${destDisplay}</td>
  </tr>
  <tr style="background:#fafafa;">
    <td style="padding:10px 14px;color:#666;font-size:13px;border-bottom:1px solid #e5e5e5;">Travel Window</td>
    <td style="padding:10px 14px;font-size:14px;border-bottom:1px solid #e5e5e5;">${dateWindow}</td>
  </tr>
  ${notes ? `<tr>
    <td style="padding:10px 14px;color:#666;font-size:13px;">Notes</td>
    <td style="padding:10px 14px;font-size:14px;">${escapeHtml(notes)}</td>
  </tr>` : ""}
</table>

<div style="background:#f0f7ff;border:1px solid #d0e3f7;border-radius:6px;padding:16px;margin-bottom:24px;">
  <p style="margin:0;font-size:14px;color:#1a5276;font-weight:600;">Scan Schedule</p>
  <p style="margin:6px 0 0;font-size:13px;color:#2c3e50;">The system checks for new empty leg matches <strong>every 6 hours</strong> at 12:00 AM, 6:00 AM, 12:00 PM, and 6:00 PM (Eastern Time). You will receive an email as soon as matching flights are found.</p>
</div>

<p style="margin:0 0 4px;font-size:13px;color:#888;">You can pause or resume this watch route at any time from the <a href="https://eclipseemptylegs.lovable.app/admin/watchroutes" style="color:#2980b9;text-decoration:none;">Watch Routes dashboard</a>.</p>

<hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
<p style="margin:0;font-size:11px;color:#aaa;">This email was sent by OneWay (by Eclipse Air Charter).</p>
</div></body></html>`;

    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: true,
        auth: { username: smtpUser, password: smtpPass },
      },
    });

    await client.send({
      from: smtpUser,
      to: broker_email,
      subject,
      content: "Your watch route has been created. View the HTML version of this email for full details.",
      html,
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
      },
    });

    await client.close();

    console.log(`[watch-route-confirm] Confirmation sent to ${broker_email} for ${origin_icao}→${destination_icao}`);

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    console.error("[watch-route-confirm] Error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
