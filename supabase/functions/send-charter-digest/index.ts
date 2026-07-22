import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FROM_ADDR = "Eclipse Air Charter <info@eclipseaircharter.com>";
const UNSUBSCRIBE_BASE = "https://cikbuzicnygdyjpuizcu.supabase.co/functions/v1/unsubscribe-charter-digest";

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isMobileUA(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return /Mobile|Android|iPhone|iPad|iPod|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua);
}

interface Leg { from_icao: string; to_icao: string; depart_date: string; }

interface DigestStats {
  windowStart: Date;
  windowEnd: Date;
  total: number;
  mobilePct: number;
  desktopPct: number;
  avgLeadTime: number;
  topCountries: Array<[string, number]>;
  topReferrers: Array<[string, number]>;
  topOrigins: Array<[string, number]>;
  topDests: Array<[string, number]>;
  oneWay: number;
  oneWayReturn: number;
  multiCity: number;
  contactBreakdown: Array<[string, number]>;
  searchClicks: number;
  dialogOpens: number;
  submissions: number;
  conversionRate: string;
  completionRate: string;
}

async function computeStats(supabase: ReturnType<typeof createClient>, opts?: { monthOffset?: number }): Promise<DigestStats> {
  // Calendar month window in UTC. monthOffset defaults to -1 (previous month).
  // monthOffset=0 → current month (used for ad-hoc tests).
  const now = new Date();
  const offset = opts?.monthOffset ?? -1;
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1, 0, 0, 0));
  const windowEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1, 0, 0, 0));

  const { data: enquiries, error: e1 } = await supabase
    .from("charter_enquiries")
    .select("*")
    .gte("created_at", windowStart.toISOString())
    .lt("created_at", windowEnd.toISOString());
  if (e1) throw e1;

  const { data: events, error: e2 } = await supabase
    .from("search_conversions")
    .select("event_type, created_at")
    .eq("flow", "charter")
    .gte("created_at", windowStart.toISOString())
    .lt("created_at", windowEnd.toISOString());
  if (e2) throw e2;

  const enquiriesArr = (enquiries ?? []) as Array<Record<string, unknown>>;
  const total = enquiriesArr.length;
  let mobile = 0, oneWay = 0, oneWayReturn = 0, multiCity = 0;
  let leadSum = 0, leadCount = 0;
  const countryMap = new Map<string, number>();
  const referrerMap = new Map<string, number>();
  const originMap = new Map<string, number>();
  const destMap = new Map<string, number>();
  const contactMap = new Map<string, number>();

  for (const e of enquiriesArr) {
    if (isMobileUA(e.user_agent as string | null)) mobile++;
    if (e.trip_type === "multi_city") multiCity++;
    else if (e.return_date) oneWayReturn++;
    else oneWay++;

    const legs = Array.isArray(e.legs) ? (e.legs as Leg[]) : [];
    if (legs[0]?.depart_date) {
      const dep = new Date(legs[0].depart_date);
      const created = new Date(e.created_at as string);
      const days = Math.round((dep.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
      if (Number.isFinite(days)) { leadSum += days; leadCount++; }
    }
    const first = legs[0]; const last = legs[legs.length - 1];
    if (first) originMap.set(first.from_icao, (originMap.get(first.from_icao) || 0) + 1);
    if (last) destMap.set(last.to_icao, (destMap.get(last.to_icao) || 0) + 1);

    const country = (e.contact_country as string) || "—";
    countryMap.set(country, (countryMap.get(country) || 0) + 1);
    const pc = (e.preferred_contact as string) || "—";
    contactMap.set(pc, (contactMap.get(pc) || 0) + 1);
    const ref = ((e.referrer as string) || "(direct)").replace(/^https?:\/\//, "").split("/")[0];
    referrerMap.set(ref, (referrerMap.get(ref) || 0) + 1);
  }

  const eventsArr = (events ?? []) as Array<{ event_type: string }>;
  const searchClicks = eventsArr.filter((e) => e.event_type === "charter_search_clicked").length;
  const dialogOpens = eventsArr.filter((e) => e.event_type === "charter_dialog_opened").length;
  const submissions = eventsArr.filter((e) => e.event_type === "charter_form_submitted").length;

  const mobilePct = total > 0 ? Math.round((mobile / total) * 100) : 0;

  return {
    windowStart, windowEnd, total,
    mobilePct, desktopPct: total > 0 ? 100 - mobilePct : 0,
    avgLeadTime: leadCount > 0 ? Math.round(leadSum / leadCount) : 0,
    topCountries: [...countryMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    topReferrers: [...referrerMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    topOrigins: [...originMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    topDests: [...destMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    oneWay, oneWayReturn, multiCity,
    contactBreakdown: [...contactMap.entries()].sort((a, b) => b[1] - a[1]),
    searchClicks, dialogOpens, submissions,
    conversionRate: searchClicks > 0 ? ((submissions / searchClicks) * 100).toFixed(1) : "0.0",
    completionRate: dialogOpens > 0 ? ((submissions / dialogOpens) * 100).toFixed(1) : "0.0",
  };
}

function formatDateShort(d: Date): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function renderBadges(items: Array<[string, number]>, mono = false): string {
  if (items.length === 0) {
    return `<span style="color:#999;font-size:13px;">No data</span>`;
  }
  const fam = mono ? "font-family:Menlo,Consolas,monospace;" : "";
  // Use a table with one cell per badge — email clients (Gmail) strip
  // display:inline-block from spans, which collapses chips into a wall of text.
  const cells = items.map(([k, n]) =>
    `<td style="padding:0 8px 8px 0;vertical-align:top;">` +
      `<div style="background:#f3f4f6;color:#222;padding:6px 12px;border-radius:14px;font-size:13px;${fam}white-space:nowrap;">` +
        `${esc(k)} <strong>(${n})</strong>` +
      `</div>` +
    `</td>`
  ).join("");
  // Wrap in a table; allow it to flow naturally. mso-line-height-rule for Outlook spacing.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>${cells}</tr></table>`;
}

function renderEmail(stats: DigestStats, disableUrl: string): string {
  const winLabel = stats.windowStart.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const year = new Date().getFullYear();

  const sectionH = `margin:0 0 14px 0;font-size:15px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:0.5px;`;
  const sectionWrap = `padding:0 32px 24px 32px;`;
  const card = `background:#fafafa;border:1px solid #eee;border-radius:6px;padding:16px;`;
  const funnelCard = `background:#fafafa;border:1px solid #eee;border-radius:6px;padding:10px 12px;`;

  const tile = (label: string, value: string) =>
    `<td style="padding:6px;" align="center" width="25%"><div style="${card}text-align:center;"><div style="font-size:24px;font-weight:700;color:#111;line-height:1;">${esc(value)}</div><div style="font-size:11px;color:#666;margin-top:6px;text-transform:uppercase;letter-spacing:0.4px;">${esc(label)}</div></div></td>`;

  const funnel =
    `<table style="width:100%;border-collapse:collapse;"><tr>` +
    `<td align="center" style="padding:4px;"><div style="font-size:22px;font-weight:700;color:#111;">${stats.searchClicks}</div><div style="font-size:11px;color:#666;text-transform:uppercase;">Search clicks</div></td>` +
    `<td align="center" width="20" style="color:#bbb;font-size:18px;">→</td>` +
    `<td align="center" style="padding:4px;"><div style="font-size:22px;font-weight:700;color:#111;">${stats.dialogOpens}</div><div style="font-size:11px;color:#666;text-transform:uppercase;">Details dialog</div></td>` +
    `<td align="center" width="20" style="color:#bbb;font-size:18px;">→</td>` +
    `<td align="center" style="padding:4px;"><div style="font-size:22px;font-weight:700;color:#111;">${stats.submissions}</div><div style="font-size:11px;color:#666;text-transform:uppercase;">Quote requests</div></td>` +
    `<td align="center" style="padding:4px;border-left:1px solid #eee;"><div style="font-size:22px;font-weight:700;color:#1d6fd8;">${stats.conversionRate}%</div><div style="font-size:11px;color:#666;text-transform:uppercase;">Overall</div></td>` +
    `</tr></table>`;

  const tripTypeRows: Array<[string, number]> = [
    ["One-way", stats.oneWay],
    ["Return", stats.oneWayReturn],
    ["Multi-city", stats.multiCity],
  ];

  // Spacer row between sections (works in all email clients including Outlook)
  const spacer = (h = 8) => `<div style="line-height:${h}px;font-size:${h}px;">&nbsp;</div>`;

  return [
    `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="format-detection" content="telephone=no,date=no"></head>`,
    `<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#222;">`,
    `<div style="max-width:760px;margin:0 auto;background:#ffffff;">`,
    `<div style="padding:32px 32px 8px 32px;"><h1 style="margin:0;font-size:22px;font-weight:700;color:#111;">Charter Enquiries — Monthly Digest</h1>`,
    `<p style="margin:6px 0 0 0;font-size:13px;color:#666;">${esc(winLabel)}</p></div>`,

    `<div style="padding:20px 24px 4px 24px;"><table style="width:100%;border-collapse:collapse;"><tr>`,
    tile("Submitted enquiries", String(stats.total)),
    tile("Mobile", `${stats.mobilePct}%`),
    tile("Desktop", `${stats.desktopPct}%`),
    tile("Avg lead time", `${stats.avgLeadTime}d`),
    `</tr></table></div>`,
    spacer(16),

    `<div style="${sectionWrap}"><h2 style="${sectionH}">Conversion Funnel</h2><div style="${funnelCard}">${funnel}<p style="margin:6px 0 0 0;font-size:11px;color:#888;">${stats.completionRate}% of dialog opens completed.</p></div></div>`,
    spacer(16),

    `<div style="${sectionWrap}"><h2 style="${sectionH}">Trip Type</h2>${renderBadges(tripTypeRows)}</div>`,
    spacer(12),
    `<div style="${sectionWrap}"><h2 style="${sectionH}">Preferred Contact</h2>${renderBadges(stats.contactBreakdown)}</div>`,
    spacer(12),
    `<div style="${sectionWrap}"><h2 style="${sectionH}">Top Origins</h2>${renderBadges(stats.topOrigins, true)}</div>`,
    spacer(12),
    `<div style="${sectionWrap}"><h2 style="${sectionH}">Top Destinations</h2>${renderBadges(stats.topDests, true)}</div>`,
    spacer(12),
    `<div style="${sectionWrap}"><h2 style="${sectionH}">Top Countries</h2>${renderBadges(stats.topCountries)}</div>`,
    spacer(12),
    `<div style="${sectionWrap}"><h2 style="${sectionH}">Top Referrers</h2>${renderBadges(stats.topReferrers)}</div>`,

    `<div style="padding:24px 32px;text-align:center;background:#fafafa;border-top:1px solid #eee;">`,
    `<p style="margin:0 0 8px 0;font-size:12px;color:#888;">© ${year} Eclipse Air Charter — Internal report</p>`,
    `<p style="margin:0;font-size:11px;color:#888;">This is an internal admin digest. <a href="${esc(disableUrl)}" style="color:#1d6fd8;text-decoration:underline;">Disable these emails</a> for this address.</p>`,
    `</div>`,
    `</div></body></html>`,
  ].join("");
}


serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let body: { test?: boolean; to?: string; monthOffset?: number } = {};
    if (req.method === "POST") {
      try { body = await req.json(); } catch { /* allow empty */ }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const stats = await computeStats(supabase, { monthOffset: body.monthOffset });

    // Determine recipients
    let recipients: Array<{ email: string; unsubscribe_token: string }>;
    if (body.test && body.to) {
      // Test: send only to provided address. Use existing token if subscribed, else create a placeholder one.
      const { data: existing } = await supabase
        .from("charter_digest_subscriptions")
        .select("email, unsubscribe_token")
        .eq("email", body.to)
        .maybeSingle();
      recipients = existing
        ? [existing as { email: string; unsubscribe_token: string }]
        : [{ email: body.to, unsubscribe_token: "test-no-token" }];
    } else {
      const { data, error } = await supabase
        .from("charter_digest_subscriptions")
        .select("email, unsubscribe_token")
        .eq("enabled", true);
      if (error) throw error;
      recipients = (data ?? []) as Array<{ email: string; unsubscribe_token: string }>;
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, message: "No active subscribers" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const smtpHost = Deno.env.get("SMTP_HOST");
    const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465", 10);
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");
    if (!smtpHost || !smtpUser || !smtpPass) {
      return new Response(JSON.stringify({ ok: false, error: "Email not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const client = new SMTPClient({
      connection: { hostname: smtpHost, port: smtpPort, tls: true, auth: { username: smtpUser, password: smtpPass } },
    });

    const subjectPrefix = body.test ? "[TEST] " : "";
    const monthLabel = stats.windowStart.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
    const subject = `${subjectPrefix}Charter Enquiries — Monthly Digest (${monthLabel})`;

    let sent = 0;
    for (const r of recipients) {
      const unsubUrl = `${UNSUBSCRIBE_BASE}?token=${r.unsubscribe_token}`;
      const html = renderEmail(stats, unsubUrl);
      await client.send({
        from: FROM_ADDR,
        to: r.email,
        subject,
        content: `Charter Enquiries digest for ${monthLabel}. Total: ${stats.total} enquiries.`,
        html,
      });
      sent++;
      if (!body.test) {
        await supabase
          .from("charter_digest_subscriptions")
          .update({ last_sent_at: new Date().toISOString() })
          .eq("email", r.email);
      }
    }

    await client.close();

    console.log(`[send-charter-digest] Sent ${sent} digest email(s). test=${body.test ?? false}`);
    return new Response(JSON.stringify({ ok: true, sent, total_enquiries: stats.total }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (err) {
    console.error("[send-charter-digest] Error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
  }
});
