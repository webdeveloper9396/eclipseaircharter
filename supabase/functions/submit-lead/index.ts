import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---------- Rate limiting (in-memory, per-isolate) ----------
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// ---------- HTML escaping ----------
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDateOnly(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}`;
}

function formatLocation(icao: string | null, locationRaw: string | null, locationType: string | null, corridor: string | null): string {
  const displayText = locationRaw || (corridor ? titleCase(corridor) : null);
  if (displayText && icao) return `${escapeHtml(displayText)} (${escapeHtml(icao)})`;
  if (displayText) return escapeHtml(displayText);
  if (icao) return escapeHtml(icao);
  return "Unknown";
}

function titleCase(str: string): string {
  return str.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function formatPrice(price: number | null, currency: string | null): string {
  if (price == null) return "Price on request";
  const curr = currency?.toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: curr }).format(price);
  } catch {
    return `${price} ${curr}`;
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize external database client
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    if (!extUrl || !extKey) {
      console.error("[submit-lead] External database configuration missing");
      return new Response(
        JSON.stringify({ ok: false, error: "Internal server error" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    const extSupabase = createClient(extUrl, extKey);
    // Rate limiting by IP
    const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("cf-connecting-ip")
      || "unknown";

    if (isRateLimited(clientIP)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Too many requests. Please try again later." }),
        { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const body = await req.json();

    // ---------- Input sanitization helpers ----------
    function sanitizeStr(val: unknown, maxLen: number): string {
      if (typeof val !== "string") return "";
      return val.trim().slice(0, maxLen);
    }

    function isValidEmail(email: string): boolean {
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return re.test(email) && email.length <= 255;
    }

    function isValidICAO(code: string): boolean {
      return /^[A-Z0-9]{3,4}$/i.test(code);
    }

    function isValidDateStr(d: string): boolean {
      return /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));
    }

    // Validate required fields — now uses full_name instead of first_name/last_name
    const required = ["request_type", "full_name", "email", "phone",
      "origin_airport_icao", "destination_airport_icao", "travel_start_date", "travel_end_date"];
    for (const field of required) {
      if (!body[field] || (typeof body[field] === "string" && body[field].trim() === "")) {
        return new Response(
          JSON.stringify({ ok: false, error: `Missing required field: ${field}` }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    if (!["leg_inquiry", "route_watch"].includes(body.request_type)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid request_type" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate email format
    const trimmedEmail = sanitizeStr(body.email, 255).toLowerCase();
    if (!isValidEmail(trimmedEmail)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid email format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate ICAO codes
    const originIcao = sanitizeStr(body.origin_airport_icao, 4).toUpperCase();
    const destIcao = sanitizeStr(body.destination_airport_icao, 4).toUpperCase();
    if (!isValidICAO(originIcao) || !isValidICAO(destIcao)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid airport code" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate date formats
    if (!isValidDateStr(body.travel_start_date) || !isValidDateStr(body.travel_end_date)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid date format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate travel window (max 14 days)
    const start = new Date(body.travel_start_date);
    const end = new Date(body.travel_end_date);
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 0 || diffDays > 13) {
      return new Response(
        JSON.stringify({ ok: false, error: "Travel window must be 1-14 days" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Sanitize all inputs before storage
    const passengersRaw = typeof body.passengers === "number" ? body.passengers : null;
    const passengers = passengersRaw !== null && passengersRaw >= 1 && passengersRaw <= 50 ? passengersRaw : null;

    // Quote intent flags
    const quoteExactLeg = body.quote_exact_leg === true;
    const quoteRequoteForRoute = body.quote_requote_for_route === true;

    const fullName = sanitizeStr(body.full_name, 200);

    const payload: Record<string, unknown> = {
      request_type: body.request_type,
      full_name: fullName,
      email: trimmedEmail,
      phone: sanitizeStr(body.phone, 30) || null,
      passengers,
      preferred_category: sanitizeStr(body.preferred_category || "", 50) || null,
      notes: sanitizeStr(body.notes || "", 500) || null,
      has_pets: body.has_pets === true,
      origin_airport_icao: originIcao,
      destination_airport_icao: destIcao,
      travel_start_date: body.travel_start_date,
      travel_end_date: body.travel_end_date,
      include_nearby: true,
      empty_leg_id: body.empty_leg_id ? sanitizeStr(body.empty_leg_id, 100) : null,
      source: sanitizeStr(body.source || "eclipse_emptylegs_alpha", 50),
      quote_exact_leg: quoteExactLeg,
      quote_requote_for_route: quoteRequoteForRoute,
    };

    const { data: leadId, error: rpcError } = await extSupabase.rpc(
      "submit_lead_request_v1",
      { p_payload: payload }
    );

    if (rpcError) {
      console.error("[submit-lead] RPC error:", rpcError);
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to save lead" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // If leg_inquiry with empty_leg_id, fetch full leg details for the email
    let legDetails: Record<string, unknown> | null = null;
    let operatorName: string | null = null;

    if (body.request_type === "leg_inquiry" && body.empty_leg_id) {
      try {
        const { data: legRow, error: legError } = await extSupabase
          .from("empty_legs")
          .select(`
            id,
            departure_airport_icao, arrival_airport_icao,
            departure_location_type, arrival_location_type,
            departure_corridor, arrival_corridor,
            departure_location_raw, arrival_location_raw,
            departure_date_start, departure_date_end,
            aircraft_model, aircraft_category, aircraft_type_id,
            price, price_currency,
            first_seen_at, last_seen_at,
            operator_id, operator_name_raw,
            status
          `)
          .eq("id", body.empty_leg_id)
          .maybeSingle();

        if (legError) {
          console.warn("[submit-lead] Failed to fetch leg details:", legError);
        } else if (legRow) {
          legDetails = legRow;

          if (legRow.operator_id) {
            const { data: opRow } = await extSupabase
              .from("operators")
              .select("name")
              .eq("id", legRow.operator_id)
              .maybeSingle();
            operatorName = opRow?.name || legRow.operator_name_raw || null;
          } else {
            operatorName = legRow.operator_name_raw || null;
          }

          if (legRow.aircraft_type_id && !legRow.aircraft_model) {
            const { data: atRow } = await extSupabase
              .from("aircraft_types")
              .select("manufacturer, model")
              .eq("id", legRow.aircraft_type_id)
              .maybeSingle();
            if (atRow) {
              legDetails.aircraft_model = [atRow.manufacturer, atRow.model].filter(Boolean).join(" ");
            }
          }
        }
      } catch (fetchErr) {
        console.warn("[submit-lead] Non-fatal error fetching leg details:", fetchErr);
      }
    }

    // Send email notification via SMTP
    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465", 10);
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");

    if (smtpHost && smtpUser && smtpPass) {
      try {
        const subject = "New Empty Leg Request from OneWay (by Eclipse)";

        const isInquiry = body.request_type === "leg_inquiry";
        const startFmt = formatDateOnly(body.travel_start_date);
        const endFmt = formatDateOnly(body.travel_end_date);
        const dateWindow = body.travel_start_date === body.travel_end_date
          ? startFmt
          : `${startFmt} – ${endFmt}`;

        // Use full_name for display
        const safeFullName = escapeHtml(fullName);
        const safeEmail = escapeHtml(trimmedEmail);
        const safePhone = escapeHtml(sanitizeStr(body.phone, 30));
        const safeOrigin = escapeHtml(originIcao);
        const safeDest = escapeHtml(destIcao);
        const safeEmptyLegId = body.empty_leg_id ? escapeHtml(String(body.empty_leg_id)) : "";

        // Build quote intent section
        let quoteIntentSection = "";
        if (body.quote_exact_leg !== undefined || body.quote_requote_for_route !== undefined) {
          quoteIntentSection = `<h3 style="margin-top:24px;margin-bottom:8px;color:#333;">Quote Intent</h3><table style="border-collapse:collapse;width:100%;"><tr><td style="padding:6px 12px;color:#666;border-bottom:1px solid #eee;">Quote exact leg as listed</td><td style="padding:6px 12px;border-bottom:1px solid #eee;font-weight:600;">${quoteExactLeg ? "Yes" : "No"}</td></tr><tr><td style="padding:6px 12px;color:#666;">Re-quote for requested route</td><td style="padding:6px 12px;font-weight:600;">${quoteRequoteForRoute ? "Yes" : "No"}</td></tr></table>`;
        }

        let legSection = "";
        if (isInquiry && legDetails) {
          const leg = legDetails as Record<string, unknown>;
          const depDisplay = formatLocation(
            leg.departure_airport_icao as string | null,
            leg.departure_location_raw as string | null,
            leg.departure_location_type as string | null,
            leg.departure_corridor as string | null
          );
          const arrDisplay = formatLocation(
            leg.arrival_airport_icao as string | null,
            leg.arrival_location_raw as string | null,
            leg.arrival_location_type as string | null,
            leg.arrival_corridor as string | null
          );
          const legStartFmt = leg.departure_date_start ? formatDateOnly(leg.departure_date_start as string) : "N/A";
          const legEndFmt = leg.departure_date_end ? formatDateOnly(leg.departure_date_end as string) : "N/A";
          const legDateWindow = leg.departure_date_start === leg.departure_date_end
            ? legStartFmt
            : `${legStartFmt} – ${legEndFmt}`;

          const safeOperator = escapeHtml(operatorName || "Unknown");
          const safeAircraft = escapeHtml(String(leg.aircraft_model || "TBD"));
          const safeCategory = leg.aircraft_category ? ` (${escapeHtml(titleCase((leg.aircraft_category as string).replace(/_/g, " ")))})` : "";
          const safeStatus = leg.status ? escapeHtml(String(leg.status)) : "N/A";

          legSection = `<h3 style="margin-top:24px;margin-bottom:8px;color:#333;">Empty Leg Details</h3><table style="border-collapse:collapse;width:100%;"><tr><td style="padding:6px 12px;color:#666;border-bottom:1px solid #eee;">Operator</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${safeOperator}</td></tr><tr><td style="padding:6px 12px;color:#666;border-bottom:1px solid #eee;">Route</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${depDisplay} → ${arrDisplay}</td></tr><tr><td style="padding:6px 12px;color:#666;border-bottom:1px solid #eee;">Date(s)</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${legDateWindow} <span style="color:#999;">(${leg.departure_date_start}${leg.departure_date_start !== leg.departure_date_end ? ` – ${leg.departure_date_end}` : ""})</span></td></tr><tr><td style="padding:6px 12px;color:#666;border-bottom:1px solid #eee;">Aircraft</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${safeAircraft}${safeCategory}</td></tr><tr><td style="padding:6px 12px;color:#666;border-bottom:1px solid #eee;">Price</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${formatPrice(leg.price as number | null, leg.price_currency as string | null)}</td></tr><tr><td style="padding:6px 12px;color:#666;border-bottom:1px solid #eee;">First Seen</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${leg.first_seen_at ? formatDateOnly((leg.first_seen_at as string).substring(0, 10)) : "N/A"}</td></tr><tr><td style="padding:6px 12px;color:#666;border-bottom:1px solid #eee;">Last Seen</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${leg.last_seen_at ? formatDateOnly((leg.last_seen_at as string).substring(0, 10)) : "N/A"}</td></tr><tr><td style="padding:6px 12px;color:#666;border-bottom:1px solid #eee;">Status</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${safeStatus}</td></tr><tr><td style="padding:6px 12px;color:#666;">Leg ID</td><td style="padding:6px 12px;font-family:monospace;font-size:12px;">${safeEmptyLegId}</td></tr></table>`;
        } else if (isInquiry && body.empty_leg_id) {
          legSection = `<h3 style="margin-top:24px;margin-bottom:8px;color:#333;">Empty Leg Details</h3><p style="color:#666;">Leg ID: <code>${safeEmptyLegId}</code> (details could not be fetched)</p>`;
        }

        const requestTypeLabel = isInquiry ? "Availability Inquiry" : "Route Watch Request";
        const submittedAt = new Date().toISOString();

        const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;"><h2 style="color:#111;margin-bottom:4px;">${requestTypeLabel}</h2><table style="border-collapse:collapse;width:100%;margin-bottom:16px;"><tr><td style="padding:4px 12px;color:#999;font-size:13px;">Lead ID</td><td style="padding:4px 12px;font-size:13px;">${escapeHtml(String(leadId))}</td></tr><tr><td style="padding:4px 12px;color:#999;font-size:13px;">Request Type</td><td style="padding:4px 12px;font-size:13px;">${escapeHtml(body.request_type)}</td></tr><tr><td style="padding:4px 12px;color:#999;font-size:13px;">Submitted</td><td style="padding:4px 12px;font-size:13px;">${escapeHtml(submittedAt)}</td></tr></table><h3 style="margin-top:24px;margin-bottom:8px;color:#333;">Contact</h3><table style="border-collapse:collapse;width:100%;"><tr><td style="padding:6px 12px;color:#666;border-bottom:1px solid #eee;">Name</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${safeFullName}</td></tr><tr><td style="padding:6px 12px;color:#666;border-bottom:1px solid #eee;">Email</td><td style="padding:6px 12px;border-bottom:1px solid #eee;"><a href="mailto:${safeEmail}">${safeEmail}</a></td></tr><tr><td style="padding:6px 12px;color:#666;border-bottom:1px solid #eee;">Phone</td><td style="padding:6px 12px;border-bottom:1px solid #eee;"><a href="tel:${safePhone}">${safePhone}</a></td></tr>${passengers ? `<tr><td style="padding:6px 12px;color:#666;border-bottom:1px solid #eee;">Passengers</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${passengers}</td></tr>` : ""}${payload.preferred_category ? `<tr><td style="padding:6px 12px;color:#666;border-bottom:1px solid #eee;">Preferred Aircraft</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${escapeHtml(titleCase((payload.preferred_category as string).replace(/_/g, " ")))}</td></tr>` : ""}<tr><td style="padding:6px 12px;color:#666;border-bottom:1px solid #eee;">Traveling with Pets</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${payload.has_pets ? "Yes" : "No"}</td></tr>${payload.notes ? `<tr><td style="padding:6px 12px;color:#666;">Notes</td><td style="padding:6px 12px;">${escapeHtml(payload.notes as string)}</td></tr>` : ""}</table><h3 style="margin-top:24px;margin-bottom:8px;color:#333;">User Intent</h3><table style="border-collapse:collapse;width:100%;"><tr><td style="padding:6px 12px;color:#666;border-bottom:1px solid #eee;">Requested Route</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${safeOrigin} → ${safeDest}</td></tr><tr><td style="padding:6px 12px;color:#666;border-bottom:1px solid #eee;">Travel Window</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${dateWindow} <span style="color:#999;">(${body.travel_start_date}${body.travel_start_date !== body.travel_end_date ? ` – ${body.travel_end_date}` : ""})</span></td></tr></table>${quoteIntentSection}${legSection}</div>`;

        const client = new SMTPClient({
          connection: {
            hostname: smtpHost,
            port: smtpPort,
            tls: true,
            auth: { username: smtpUser, password: smtpPass },
          },
        });

        await client.send({
          from: "emptylegs@eclipseaircharter.com",
          to: "emptylegs@eclipseaircharter.com",
          subject,
          content: "New lead submission",
          html,
        });

        await client.close();

        console.log("[submit-lead] Email sent successfully via SMTP");
      } catch (emailErr) {
        // Non-fatal: lead is already persisted
        console.error("[submit-lead] Email send failed:", emailErr);
      }
    } else {
      console.warn("[submit-lead] SMTP secrets not configured, skipping email notification");
    }

    return new Response(
      JSON.stringify({ ok: true, lead_request_id: leadId }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    console.error("[submit-lead] Unhandled error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
