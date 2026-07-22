import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RECIPIENT = "charter@eclipseaircharter.com";
const FROM_ADDR = "Eclipse Air Charter <info@eclipseaircharter.com>";

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatHour12(h: number | null | undefined): string {
  if (h === null || h === undefined) return "";
  const period = h < 12 ? "AM" : "PM";
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(hr).padStart(2, "0")}:00 ${period}`;
}

function formatDate(dateStr: string, hour: number | null | undefined): string {
  // dateStr = YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const months = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
  const datePart = `${d} ${months[date.getMonth()]} ${y}`;
  const timePart = formatHour12(hour);
  return timePart ? `${datePart} ${timePart}` : datePart;
}

interface Leg {
  from_icao: string;
  from_label: string;
  to_icao: string;
  to_label: string;
  depart_date: string;
  depart_hour: number | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { enquiry_id } = await req.json();
    if (!enquiry_id || typeof enquiry_id !== "string") {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing enquiry_id" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: row, error } = await supabase
      .from("charter_enquiries")
      .select("*")
      .eq("id", enquiry_id)
      .single();

    if (error || !row) {
      console.error("[send-charter-enquiry] Enquiry not found:", error);
      return new Response(
        JSON.stringify({ ok: false, error: "Enquiry not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const num = row.enquiry_number ?? "—";
    const legs: Leg[] = Array.isArray(row.legs) ? row.legs : [];

    // Build leg rows. For one_way with a return_date, append a return leg.
    const displayLegs: Array<{ from: string; to: string; date: string; pax: number }> = [];
    for (const leg of legs) {
      displayLegs.push({
        from: leg.from_label,
        to: leg.to_label,
        date: formatDate(leg.depart_date, leg.depart_hour),
        pax: row.passengers,
      });
    }
    if (row.trip_type === "one_way" && row.return_date && legs[0]) {
      const first = legs[0];
      displayLegs.push({
        from: first.to_label,
        to: first.from_label,
        date: formatDate(row.return_date, row.return_hour),
        pax: row.passengers,
      });
    }

    const contactMethodLabel: Record<string, string> = {
      call: "Call",
      email: "Email",
      whatsapp: "WhatsApp",
    };

    const subject = `New Web Enquiry Received — Search #${num}`;

    const labelStyle = "padding:2px 14px 2px 0;color:#555;font-weight:700;white-space:nowrap;vertical-align:top;";
    const valueStyle = "padding:2px 0;color:#222;vertical-align:top;";
    // iOS Mail wraps data-detector links (dates/times) onto multiple lines inside narrow cells.
    const noDetect = "color:#222;text-decoration:none;pointer-events:none;";

    // Leg cards: stacked label/value layout (works on mobile and desktop, no column squish).
    const legLabel = "padding:3px 12px 3px 0;color:#666;font-weight:700;font-size:13px;white-space:nowrap;vertical-align:top;width:1%;";
    const legValue = "padding:3px 0;color:#222;font-size:14px;vertical-align:top;";
    const legCard = "margin:0 0 14px 0;padding:14px 16px;background:#fafafa;border:1px solid #eee;border-radius:6px;";

    const legsHtml = displayLegs.map((l, idx) =>
      `<div style="${legCard}">` +
        `<div style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 8px 0;">Leg ${idx + 1}</div>` +
        `<table style="border-collapse:collapse;font-size:14px;width:100%;">` +
          `<tr><td style="${legLabel}">From:</td><td style="${legValue}">${escapeHtml(l.from)}</td></tr>` +
          `<tr><td style="${legLabel}">To:</td><td style="${legValue}">${escapeHtml(l.to)}</td></tr>` +
          `<tr><td style="${legLabel}">Date:</td><td style="${legValue}"><span style="${noDetect}">${escapeHtml(l.date)}</span></td></tr>` +
          `<tr><td style="${legLabel}">Passengers:</td><td style="${legValue}">${l.pax}</td></tr>` +
        `</table>` +
      `</div>`
    ).join("");

    // Determine trip type label. A "one_way" enquiry with a return_date is a Round Trip.
    let tripTypeLabel = "One Way";
    if (row.trip_type === "multi_city") tripTypeLabel = "Multi-City";
    else if (row.return_date) tripTypeLabel = "Round Trip";

    // Determine device (mobile vs desktop) from user agent.
    const ua = (row.user_agent || "") as string;
    const isMobile = /Mobi|Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(ua);
    const deviceLabel = ua ? (isMobile ? "mobile" : "desktop") : "";

    // Submission timestamp (e.g., "15 June 2026 at 02:53 PM")
    const submittedAt = row.created_at ? new Date(row.created_at) : new Date();
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const subDate = `${submittedAt.getDate()} ${months[submittedAt.getMonth()]} ${submittedAt.getFullYear()}`;
    let h = submittedAt.getHours();
    const mins = String(submittedAt.getMinutes()).padStart(2, "0");
    const ampm = h < 12 ? "AM" : "PM";
    h = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const subTime = `${String(h).padStart(2,"0")}:${mins} ${ampm}`;
    const submittedLine = deviceLabel
      ? `A charter search has been submitted via the website on <strong>${deviceLabel}</strong> at ${subDate}, ${subTime} GMT.`
      : `A charter search has been submitted via the website at ${subDate}, ${subTime} GMT.`;


    const year = new Date().getFullYear();

    // Joined as a single string (no leading whitespace on lines) to avoid
    // quoted-printable soft-wrap artifacts (e.g. trailing "=20") in email clients.
    const html = [
      `<!DOCTYPE html><html><head><meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no"><meta name="x-apple-disable-message-reformatting"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#222;">`,
      `<div style="max-width:760px;margin:0 auto;background:#ffffff;">`,
      `<div style="padding:32px 32px 0 32px;"><h1 style="margin:0;font-size:22px;font-weight:700;color:#111;">Eclipse Air Charter &mdash; Search <span style="color:#1d6fd8;">#${num}</span></h1></div>`,
      `<div style="line-height:24px;font-size:24px;">&nbsp;</div>`,
      `<div style="padding:0 32px;"><p style="margin:0;font-size:14px;color:#333;line-height:1.5;">${submittedLine}</p></div>`,
      `<div style="line-height:24px;font-size:24px;">&nbsp;</div>`,
      `<div style="padding:0 32px;"><h2 style="margin:0 0 12px 0;font-size:16px;font-weight:700;color:#111;">Contact</h2>`,
      `<table style="border-collapse:collapse;font-size:14px;">`,
      `<tr><td style="${labelStyle}">Name:</td><td style="${valueStyle}">${escapeHtml(row.contact_name || "")}</td></tr>`,
      `<tr><td style="${labelStyle}">Email:</td><td style="${valueStyle}"><a href="mailto:${escapeHtml(row.contact_email)}" style="color:#1d6fd8;">${escapeHtml(row.contact_email || "")}</a></td></tr>`,
      `<tr><td style="${labelStyle}">Phone:</td><td style="${valueStyle}">${escapeHtml(row.contact_phone || "—")}</td></tr>`,
      `<tr><td style="${labelStyle}">Country:</td><td style="${valueStyle}">${escapeHtml(row.contact_country || "—")}</td></tr>`,
      `<tr><td style="${labelStyle}">Preferred Contact:</td><td style="${valueStyle}">${escapeHtml(contactMethodLabel[row.preferred_contact] || row.preferred_contact || "—")}</td></tr>`,
      `</table></div>`,
      `<div style="line-height:48px;font-size:48px;">&nbsp;</div>`,
      `<div style="padding:0 32px 8px 32px;"><h2 style="margin:0 0 8px 0;font-size:16px;font-weight:700;color:#111;">Request for Quote</h2>`,
      `<p style="margin:0 0 14px 0;font-size:13px;color:#666;">Trip type: <strong style="color:#222;">${tripTypeLabel}</strong></p></div>`,

      `<div style="padding:0 32px 24px 32px;">${legsHtml}</div>`,
      `<div style="padding:18px 32px;text-align:center;background:#fafafa;border-top:1px solid #eee;"><p style="margin:0;font-size:12px;color:#888;">© ${year} Eclipse Air Charter</p></div>`,
      `</div></body></html>`,
    ].join("");

    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465", 10);
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");

    if (!smtpHost || !smtpUser || !smtpPass) {
      console.error("[send-charter-enquiry] SMTP secrets not configured");
      return new Response(
        JSON.stringify({ ok: false, error: "Email not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const client = new SMTPClient({
      connection: {
        hostname: smtpHost,
        port: smtpPort,
        tls: true,
        auth: { username: smtpUser, password: smtpPass },
      },
    });

    await client.send({
      from: FROM_ADDR,
      to: RECIPIENT,
      subject,
      content: `New charter search enquiry #${num}`,
      html,
    });

    await client.close();

    console.log(`[send-charter-enquiry] Sent enquiry #${num} to ${RECIPIENT}`);

    return new Response(
      JSON.stringify({ ok: true, enquiry_number: num }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (err) {
    console.error("[send-charter-enquiry] Unhandled error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
});
