/**
 * Fire-and-forget conversion event logger.
 */
export function logConversion(params: {
  sessionId: string;
  searchLogId?: string | null;
  eventType:
    | "dialog_opened"
    | "form_submitted"
    | "charter_search_clicked"
    | "charter_dialog_opened"
    | "charter_form_submitted";
  requestType?: "leg_inquiry" | "route_watch";
  matchSection?: string | null;
  emptyLegId?: string | null;
  metadata?: Record<string, unknown>;
  source?: string | null;
  flow?: "empty_legs" | "charter";
  enquiryId?: string | null;
}) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/log-conversion`;
  const meta = { ...(params.metadata || {}) };
  if (params.source) meta.source = params.source;

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: params.sessionId,
      search_log_id: params.searchLogId || null,
      event_type: params.eventType,
      request_type: params.requestType || null,
      match_section: params.matchSection || null,
      empty_leg_id: params.emptyLegId || null,
      metadata: meta,
      flow: params.flow || "empty_legs",
      enquiry_id: params.enquiryId || null,
    }),
    keepalive: true,
  }).catch(() => {});
}
