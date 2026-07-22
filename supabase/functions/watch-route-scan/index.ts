import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOCK_ID = "watch_route_scan";
const LOCK_TTL_MINUTES = 10; // lock expires after 10 min (function should finish in <60s)

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function formatPrice(price: number | null, currency: string | null): string {
  if (price == null) return "Price on request";
  const curr = currency?.toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: curr }).format(price);
  } catch {
    return `${price} ${curr}`;
  }
}

interface MatchRow {
  leg_id?: string;
  route?: string;
  origin_icao?: string;
  destination_icao?: string;
  departure_date_start: string;
  departure_date_end: string;
  aircraft_model: string | null;
  aircraft_category: string | null;
  price: number | null;
  price_currency: string | null;
  operator_name: string | null;
  operator_contact_email: string | null;
  match_label: string | null;
  reposition_nm?: number | null;
}

type BucketKey = "exact" | "nearby_airports" | "same_area" | "wider";

interface BucketedMatches {
  exact?: MatchRow[];
  nearby_airports?: MatchRow[];
  same_area?: MatchRow[];
  wider?: MatchRow[];
}

const BUCKET_ORDER: { key: BucketKey; label: string }[] = [
  { key: "exact", label: "Exact" },
  { key: "nearby_airports", label: "Nearby Airports" },
  { key: "same_area", label: "Same Area" },
  { key: "wider", label: "Wider" },
];

function getRouteLabel(m: MatchRow): string {
  if (m.route) return m.route;
  if (m.origin_icao && m.destination_icao) return `${m.origin_icao} → ${m.destination_icao}`;
  return "";
}

function renderBucketRows(matches: MatchRow[], bucketKey: BucketKey): string {
  return matches.map((m) => {
    const dateWindow = m.departure_date_start === m.departure_date_end
      ? formatDate(m.departure_date_start)
      : `${formatDate(m.departure_date_start)} - ${formatDate(m.departure_date_end)}`;
    const matchLabelParts: string[] = [];
    if (m.match_label) matchLabelParts.push(m.match_label);
    if (bucketKey === "nearby_airports" && m.reposition_nm != null) {
      matchLabelParts.push(`${Math.round(m.reposition_nm)} NM`);
    }
    const matchCell = matchLabelParts.join(" · ");
    return `<tr>
<td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;">${escapeHtml(getRouteLabel(m))}</td>
<td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;">${dateWindow}</td>
<td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;">${escapeHtml(m.aircraft_model || "TBD")}${m.aircraft_category ? ` (${escapeHtml(m.aircraft_category)})` : ""}</td>
<td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;">${formatPrice(m.price, m.price_currency)}</td>
<td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;">${escapeHtml(m.operator_name || "")}</td>
<td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;">${escapeHtml(m.operator_contact_email || "")}</td>
<td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;">${escapeHtml(matchCell)}</td>
</tr>`;
  }).join("");
}

function renderSectionedMatches(buckets: BucketedMatches, title: string): string {
  const totalCount = BUCKET_ORDER.reduce((sum, b) => sum + (buckets[b.key]?.length ?? 0), 0);
  if (totalCount === 0) return "";

  const tableHeader = `<tr style="background:#f5f5f5;">
<th style="padding:6px 10px;text-align:left;font-size:12px;">Route</th>
<th style="padding:6px 10px;text-align:left;font-size:12px;">Dates</th>
<th style="padding:6px 10px;text-align:left;font-size:12px;">Aircraft</th>
<th style="padding:6px 10px;text-align:left;font-size:12px;">Price</th>
<th style="padding:6px 10px;text-align:left;font-size:12px;">Operator</th>
<th style="padding:6px 10px;text-align:left;font-size:12px;">Contact</th>
<th style="padding:6px 10px;text-align:left;font-size:12px;">Match</th>
</tr>`;

  const sections = BUCKET_ORDER.map(({ key, label }) => {
    const rows = buckets[key] ?? [];
    if (rows.length === 0) return "";
    return `<h4 style="margin:14px 0 6px;color:#444;font-size:13px;">${escapeHtml(label)} (${rows.length})</h4>
<table style="border-collapse:collapse;width:100%;border:1px solid #ddd;">
${tableHeader}
${renderBucketRows(rows, key)}
</table>`;
  }).filter(Boolean).join("");

  return `<h3 style="margin:20px 0 4px;color:#333;">${escapeHtml(title)} (${totalCount})</h3>
${sections}`;
}

function collectNewMatchIdsAndSections(buckets: BucketedMatches): { legIds: string[]; sections: string[] } {
  const legIds: string[] = [];
  const sections: string[] = [];
  for (const { key } of BUCKET_ORDER) {
    for (const row of buckets[key] ?? []) {
      if (row.leg_id) {
        legIds.push(row.leg_id);
        sections.push(key);
      }
    }
  }
  return { legIds, sections };
}

// ── Lock helpers ─────────────────────────────────────────────────────────────

async function tryAcquireLock(ext: ReturnType<typeof createClient>): Promise<boolean> {
  // Check if an active lock exists
  const { data: existing } = await ext
    .from("workflow_locks")
    .select("id, locked_at")
    .eq("id", LOCK_ID)
    .maybeSingle();

  if (existing?.locked_at) {
    const lockAge = Date.now() - new Date(existing.locked_at).getTime();
    if (lockAge < LOCK_TTL_MINUTES * 60 * 1000) {
      console.log(`[watch-route-scan] Lock held since ${existing.locked_at} (age ${Math.round(lockAge / 1000)}s), skipping`);
      return false;
    }
  }

  // Acquire or refresh lock
  const { error } = await ext
    .from("workflow_locks")
    .upsert({ id: LOCK_ID, locked_at: new Date().toISOString() }, { onConflict: "id" });

  if (error) {
    console.error("[watch-route-scan] Failed to acquire lock:", error.message);
    return false;
  }
  return true;
}

async function releaseLock(ext: ReturnType<typeof createClient>): Promise<void> {
  // Use epoch date instead of null in case column is NOT NULL
  await ext
    .from("workflow_locks")
    .update({ locked_at: "2000-01-01T00:00:00Z" })
    .eq("id", LOCK_ID);
}

// ── Main handler ─────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const runId = crypto.randomUUID();
  const startTime = Date.now();
  let scanned = 0;
  let emailed = 0;
  let errors = 0;
  let skippedDueToLock = false;

  console.log(`[watch-route-scan] run=${runId} started_at=${new Date().toISOString()}`);

  try {
    const extUrl = Deno.env.get("EXTERNAL_SUPABASE_URL");
    const extKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY");
    if (!extUrl || !extKey) {
      throw new Error("External database configuration missing");
    }
    const ext = createClient(extUrl, extKey);

    // ── Step 0: Acquire lock ──
    const acquired = await tryAcquireLock(ext);
    if (!acquired) {
      skippedDueToLock = true;
      console.warn(`[watch-route-scan] run=${runId} SKIPPED - another run is in progress`);
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "lock_active", run_id: runId, elapsed_ms: Date.now() - startTime }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    try {
      // ── Step 1: Scan for watch routes with new matches ──
      const { data: watchRoutes, error: scanErr } = await ext.rpc(
        "scan_watch_routes_hybrid_v1",
        { p_limit: 200 }
      );
      if (scanErr) {
        throw new Error(`scan_watch_routes_hybrid_v1 failed: ${scanErr.message}`);
      }

      if (!watchRoutes || watchRoutes.length === 0) {
        console.log(`[watch-route-scan] run=${runId} No watch routes with new matches.`);
        return new Response(
          JSON.stringify({ ok: true, run_id: runId, scanned: 0, emailed: 0, errors: 0, elapsed_ms: Date.now() - startTime }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      scanned = watchRoutes.length;
      console.log(`[watch-route-scan] run=${runId} found ${scanned} watches with new matches`);

      // ── SMTP setup (single connection for all emails) ──
      const smtpHost = Deno.env.get("SMTP_HOST");
      const smtpPort = parseInt(Deno.env.get("SMTP_PORT") || "465", 10);
      const smtpUser = Deno.env.get("SMTP_USER");
      const smtpPass = Deno.env.get("SMTP_PASS");

      if (!smtpHost || !smtpUser || !smtpPass) {
        throw new Error("SMTP configuration missing");
      }

      const smtpClient = new SMTPClient({
        connection: {
          hostname: smtpHost,
          port: smtpPort,
          tls: true,
          auth: { username: smtpUser, password: smtpPass },
        },
      });

      try {
        for (const wr of watchRoutes) {
          const watchRouteId = wr.id || wr.watch_route_id;
          const watchStart = Date.now();
          try {
            // ── Step 2: Get email payload ──
            const { data: payload, error: payErr } = await ext.rpc(
              "watch_route_email_payload_hybrid_v1",
              { p_watch_route_id: watchRouteId }
            );
            if (payErr) {
              console.error(`[watch-route-scan] run=${runId} payload error for ${watchRouteId}: ${payErr.message}`);
              errors++;
              continue;
            }

            if (!payload) {
              console.warn(`[watch-route-scan] run=${runId} No payload for ${watchRouteId}, skipping.`);
              continue;
            }

            const watch = payload.watch || payload;
            const brokerEmail = watch.broker_email || payload.broker_email;
            const originIcao = watch.origin_icao || payload.origin_icao || "????";
            const destIcao = watch.destination_icao || payload.destination_icao || "????";
            const dateStart = watch.date_start || payload.date_start || "";
            const dateEnd = watch.date_end || payload.date_end || "";
            const watchNotes = watch.notes || payload.notes || "";
            const newMatches: BucketedMatches = payload.new_matches || {};
            const previousMatches: BucketedMatches = payload.previous_matches || {};

            const { legIds: newLegIds, sections: newSections } =
              collectNewMatchIdsAndSections(newMatches);

            if (newLegIds.length === 0) {
              console.log(`[watch-route-scan] run=${runId} watch=${watchRouteId} no new legs after bucketing, skipping email`);
              continue;
            }

            if (!brokerEmail) {
              console.warn(`[watch-route-scan] run=${runId} No broker_email for ${watchRouteId}, skipping.`);
              continue;
            }

            const dateWindow = dateStart === dateEnd
              ? formatDate(dateStart)
              : `${formatDate(dateStart)} - ${formatDate(dateEnd)}`;

            // ASCII-safe subject to avoid MIME encoding issues
            const isTestRoute = typeof watchNotes === "string" && watchNotes.trim().toUpperCase().startsWith("TEST");
            const subjectBase = `New empty leg match: ${originIcao} -> ${destIcao} (${dateStart} to ${dateEnd})`;
            const subject = isTestRoute ? `[TEST - do not action] ${subjectBase}` : subjectBase;

            const testBanner = isTestRoute
              ? `<div style="background:#fff3cd;border:1px solid #f0c36d;color:#7a5d00;padding:10px 14px;border-radius:6px;margin-bottom:16px;font-size:13px;"><strong>TEST SEND — do not action.</strong> This message was generated to verify the hybrid watch-route alert pipeline.</div>`
              : "";

            const watchSection = `<h2 style="margin:0 0 12px;color:#222;">Watch Route Alert</h2>
<table style="border-collapse:collapse;width:100%;margin-bottom:16px;">
<tr><td style="padding:6px 10px;color:#666;border-bottom:1px solid #eee;">Route</td><td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">${escapeHtml(originIcao)} -&gt; ${escapeHtml(destIcao)}</td></tr>
<tr><td style="padding:6px 10px;color:#666;border-bottom:1px solid #eee;">Travel Window</td><td style="padding:6px 10px;border-bottom:1px solid #eee;">${dateWindow}</td></tr>
${watchNotes ? `<tr><td style="padding:6px 10px;color:#666;">Notes</td><td style="padding:6px 10px;">${escapeHtml(watchNotes)}</td></tr>` : ""}
</table>`;

            const newMatchesHtml = renderSectionedMatches(newMatches, "New Matches (This Scan)");
            const prevMatchesHtml = renderSectionedMatches(previousMatches, "Previous Matches");

            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:700px;margin:0 auto;padding:24px;">
${testBanner}
${watchSection}
${newMatchesHtml}
${prevMatchesHtml}
<p style="margin-top:24px;font-size:12px;color:#999;">This alert was sent by OneWay (by Eclipse Air Charter). To stop receiving alerts, set this watch route to inactive in the dashboard.</p>
</div></body></html>`;

            // ── Step 3: Send email ──
            await smtpClient.send({
              from: smtpUser,
              to: brokerEmail,
              subject,
              content: "You have new empty leg matches. View this email in HTML for details.",
              html,
            });

            // ── Step 4: Mark alerted (only after successful send) ──
            const { error: markErr } = await ext.rpc("mark_watch_route_alerted_hybrid_v1", {
              p_watch_route_id: watchRouteId,
              p_leg_ids: newLegIds,
              p_sections: newSections,
            });
            if (markErr) {
              console.error(`[watch-route-scan] run=${runId} mark_alerted error for ${watchRouteId}: ${markErr.message}`);
              // Email was sent but mark failed — will cause a duplicate on next run.
              // This is a known acceptable risk (better to duplicate than to miss).
              errors++;
            } else {
              emailed++;
            }

            console.log(`[watch-route-scan] run=${runId} watch=${watchRouteId} processed in ${Date.now() - watchStart}ms`);
          } catch (wrError) {
            console.error(`[watch-route-scan] run=${runId} Error processing ${watchRouteId}:`, wrError);
            errors++;
          }
        }
      } finally {
        // Always close the SMTP connection
        try { await smtpClient.close(); } catch { /* ignore close errors */ }
      }
    } finally {
      // Always release the lock, even on error
      await releaseLock(ext);
    }

    const elapsed = Date.now() - startTime;
    console.log(`[watch-route-scan] run=${runId} DONE scanned=${scanned} emailed=${emailed} errors=${errors} duration_ms=${elapsed}`);
    return new Response(
      JSON.stringify({ ok: true, run_id: runId, scanned, emailed, errors, elapsed_ms: elapsed }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[watch-route-scan] run=${runId} FATAL error after ${elapsed}ms:`, err);
    return new Response(
      JSON.stringify({ ok: false, run_id: runId, error: err.message, scanned, emailed, errors, elapsed_ms: elapsed }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
