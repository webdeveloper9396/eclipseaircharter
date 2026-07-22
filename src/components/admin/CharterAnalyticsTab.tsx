import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, subYears, startOfDay, isAfter, differenceInDays } from "date-fns";
import { Smartphone, Monitor, CheckCircle2, MousePointerClick, Send } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { MetricTile } from "@/components/dashboard/MetricTile";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DigestRecipientsPanel } from "@/components/admin/DigestRecipientsPanel";

export type TimeRange = "today" | "7d" | "30d" | "60d" | "90d" | "180d" | "1y" | "all";

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  today: "Today",
  "7d": "7 days",
  "30d": "30 days",
  "60d": "60 days",
  "90d": "90 days",
  "180d": "180 days",
  "1y": "1 year",
  all: "All time",
};

function getTimeRangeCutoff(range: TimeRange): Date | null {
  const now = new Date();
  const today = startOfDay(now);
  switch (range) {
    case "today": return today;
    case "7d": return subDays(today, 7);
    case "30d": return subDays(today, 30);
    case "60d": return subDays(today, 60);
    case "90d": return subDays(today, 90);
    case "180d": return subDays(today, 180);
    case "1y": return subYears(today, 1);
    case "all": return null;
  }
}

function isMobileUserAgent(ua: string | null): boolean {
  if (!ua) return false;
  return /Mobile|Android|iPhone|iPad|iPod|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua);
}

interface CharterEnquiry {
  id: string;
  enquiry_number: number;
  created_at: string;
  trip_type: "one_way" | "multi_city";
  legs: Array<{
    from_icao: string;
    from_label: string;
    to_icao: string;
    to_label: string;
    depart_date: string;
    depart_hour: number | null;
  }>;
  return_date: string | null;
  return_hour: number | null;
  passengers: number;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  contact_country: string;
  preferred_contact: "call" | "email" | "whatsapp";
  user_agent: string | null;
  referrer: string | null;
}

interface CharterEvent {
  id: string;
  created_at: string;
  session_id: string;
  event_type: string;
  enquiry_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface Props {
  timeRange: TimeRange;
}

export function CharterAnalyticsTab({ timeRange }: Props) {
  const { data: enquiries = [], isLoading } = useQuery({
    queryKey: ["charter-enquiries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("charter_enquiries")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as unknown as CharterEnquiry[];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["charter-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("search_conversions")
        .select("id, created_at, session_id, event_type, enquiry_id, metadata")
        .eq("flow", "charter")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return data as unknown as CharterEvent[];
    },
  });

  const cutoff = getTimeRangeCutoff(timeRange);

  const filteredEnquiries = useMemo(
    () => (cutoff ? enquiries.filter((e) => isAfter(new Date(e.created_at), cutoff)) : enquiries),
    [enquiries, cutoff]
  );

  const filteredEvents = useMemo(
    () => (cutoff ? events.filter((e) => isAfter(new Date(e.created_at), cutoff)) : events),
    [events, cutoff]
  );

  const metrics = useMemo(() => {
    const total = filteredEnquiries.length;
    let mobile = 0;
    let oneWay = 0;
    let oneWayReturn = 0;
    let multiCity = 0;
    let leadTimeSum = 0;
    let leadTimeCount = 0;
    let paxSum = 0;
    const routeMap = new Map<string, number>();
    const originMap = new Map<string, number>();
    const destMap = new Map<string, number>();
    const countryMap = new Map<string, number>();
    const contactMap = new Map<string, number>();
    const referrerMap = new Map<string, number>();

    for (const e of filteredEnquiries) {
      if (isMobileUserAgent(e.user_agent)) mobile++;
      if (e.trip_type === "multi_city") multiCity++;
      else if (e.return_date) oneWayReturn++;
      else oneWay++;

      paxSum += e.passengers;

      const legs = Array.isArray(e.legs) ? e.legs : [];
      if (legs[0]?.depart_date) {
        const days = differenceInDays(new Date(legs[0].depart_date), new Date(e.created_at));
        if (Number.isFinite(days)) {
          leadTimeSum += days;
          leadTimeCount++;
        }
      }

      const first = legs[0];
      const last = legs[legs.length - 1];
      if (first && last) {
        const route = `${first.from_icao} → ${last.to_icao}`;
        routeMap.set(route, (routeMap.get(route) || 0) + 1);
        originMap.set(first.from_icao, (originMap.get(first.from_icao) || 0) + 1);
        destMap.set(last.to_icao, (destMap.get(last.to_icao) || 0) + 1);
      }

      countryMap.set(e.contact_country, (countryMap.get(e.contact_country) || 0) + 1);
      contactMap.set(e.preferred_contact, (contactMap.get(e.preferred_contact) || 0) + 1);

      const ref = (e.referrer || "(direct)").replace(/^https?:\/\//, "").split("/")[0];
      referrerMap.set(ref, (referrerMap.get(ref) || 0) + 1);
    }

    const searchClicks = filteredEvents.filter((e) => e.event_type === "charter_search_clicked").length;
    const dialogOpens = filteredEvents.filter((e) => e.event_type === "charter_dialog_opened").length;
    const submissions = filteredEvents.filter((e) => e.event_type === "charter_form_submitted").length;

    const conversionRate = searchClicks > 0 ? ((submissions / searchClicks) * 100).toFixed(1) : "0";
    const completionRate = dialogOpens > 0 ? ((submissions / dialogOpens) * 100).toFixed(1) : "0";

    return {
      total,
      mobilePct: total > 0 ? Math.round((mobile / total) * 100) : 0,
      oneWay,
      oneWayReturn,
      multiCity,
      avgPax: total > 0 ? (paxSum / total).toFixed(1) : "0",
      avgLeadTime: leadTimeCount > 0 ? Math.round(leadTimeSum / leadTimeCount) : 0,
      topRoutes: Array.from(routeMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8),
      topOrigins: Array.from(originMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
      topDests: Array.from(destMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
      topCountries: Array.from(countryMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
      contactBreakdown: Array.from(contactMap.entries()).sort((a, b) => b[1] - a[1]),
      topReferrers: Array.from(referrerMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5),
      searchClicks,
      dialogOpens,
      submissions,
      conversionRate,
      completionRate,
    };
  }, [filteredEnquiries, filteredEvents]);

  const columns: Column<CharterEnquiry>[] = [
    {
      key: "created_at",
      header: "Time",
      render: (r) => (
        <span className="text-xs whitespace-nowrap">{format(new Date(r.created_at), "MMM d, HH:mm")}</span>
      ),
    },
    {
      key: "trip",
      header: "Trip",
      render: (r) => {
        const label = r.trip_type === "multi_city"
          ? `Multi-city (${r.legs.length})`
          : r.return_date ? "Return" : "One-way";
        return <Badge variant="secondary" className="text-[10px]">{label}</Badge>;
      },
    },
    {
      key: "route",
      header: "Route",
      render: (r) => {
        const legs = Array.isArray(r.legs) ? r.legs : [];
        const path = legs.map((l, i) =>
          i === 0 ? `${l.from_icao} → ${l.to_icao}` : `→ ${l.to_icao}`
        ).join(" ");
        return <span className="text-xs font-mono">{path || "—"}</span>;
      },
    },
    {
      key: "depart",
      header: "Departure",
      render: (r) => {
        const d = r.legs?.[0]?.depart_date;
        return <span className="text-xs whitespace-nowrap">{d || "—"}</span>;
      },
    },
    {
      key: "pax",
      header: "Pax",
      render: (r) => <span className="text-xs">{r.passengers}</span>,
    },
    {
      key: "contact",
      header: "Contact",
      render: (r) => (
        <div className="flex flex-col">
          <span className="text-xs">{r.contact_name}</span>
          <span className="text-[10px] text-muted-foreground">{r.contact_email}</span>
        </div>
      ),
    },
    {
      key: "country",
      header: "Country",
      render: (r) => <span className="text-xs">{r.contact_country}</span>,
    },
    {
      key: "preferred",
      header: "Prefers",
      render: (r) => (
        <Badge variant="outline" className="text-[10px] capitalize">{r.preferred_contact}</Badge>
      ),
    },
    {
      key: "device",
      header: "Device",
      render: (r) => {
        const mobile = isMobileUserAgent(r.user_agent);
        return (
          <Badge variant="secondary" className="text-[10px] gap-1">
            {mobile ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
            {mobile ? "Mobile" : "Desktop"}
          </Badge>
        );
      },
    },
  ];

  return (
    <div>
      {/* Digest recipients */}
      <DigestRecipientsPanel />

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricTile label="Submitted enquiries" value={metrics.total} />
        <MetricTile label="Avg lead time" value={`${metrics.avgLeadTime}d`} sublabel="days until departure" />
        <MetricTile label="Mobile" value={`${metrics.mobilePct}%`} icon={<Smartphone className="h-4 w-4" />} />
        <MetricTile label="Desktop" value={`${100 - metrics.mobilePct}%`} icon={<Monitor className="h-4 w-4" />} />
      </div>

      {/* Funnel */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Conversion Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 text-sm flex-wrap">
            <div className="text-center">
              <p className="text-2xl font-semibold tabular-nums flex items-center gap-1.5 justify-center">
                <MousePointerClick className="h-4 w-4 text-muted-foreground" />
                {metrics.searchClicks}
              </p>
              <p className="text-xs text-muted-foreground">Search clicks</p>
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="text-center">
              <p className="text-2xl font-semibold tabular-nums">{metrics.dialogOpens}</p>
              <p className="text-xs text-muted-foreground">Details dialog</p>
              {metrics.searchClicks > 0 && (
                <p className="text-[10px] text-muted-foreground/60">
                  {((metrics.dialogOpens / metrics.searchClicks) * 100).toFixed(1)}%
                </p>
              )}
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="text-center">
              <p className="text-2xl font-semibold tabular-nums flex items-center gap-1.5 justify-center">
                <Send className="h-4 w-4 text-muted-foreground" />
                {metrics.submissions}
              </p>
              <p className="text-xs text-muted-foreground">Request Quote</p>
              {metrics.dialogOpens > 0 && (
                <p className="text-[10px] text-muted-foreground/60">
                  {metrics.completionRate}% of opens
                </p>
              )}
            </div>
            <div className="ml-auto text-right">
              <p className="text-2xl font-semibold tabular-nums">{metrics.conversionRate}%</p>
              <p className="text-xs text-muted-foreground">Overall conversion</p>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">
            Search clicks tracked client-side from {format(new Date(), "MMM d, yyyy")} forward. Historical enquiries
            without click events count toward submissions only.
          </p>
        </CardContent>
      </Card>

      {/* Trip type & contact method */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Trip Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="text-xs">One-way ({metrics.oneWay})</Badge>
              <Badge variant="secondary" className="text-xs">Return ({metrics.oneWayReturn})</Badge>
              <Badge variant="secondary" className="text-xs">Multi-city ({metrics.multiCity})</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Preferred Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {metrics.contactBreakdown.length === 0 ? (
                <span className="text-xs text-muted-foreground">No data</span>
              ) : (
                metrics.contactBreakdown.map(([m, n]) => (
                  <Badge key={m} variant="secondary" className="text-xs capitalize">{m} ({n})</Badge>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top routes / origins / destinations */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Top Routes</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {metrics.topRoutes.length === 0
                ? <span className="text-xs text-muted-foreground">No data</span>
                : metrics.topRoutes.map(([r, n]) => (
                  <Badge key={r} variant="secondary" className="text-xs font-mono">{r} ({n})</Badge>
                ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Top Origins</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {metrics.topOrigins.length === 0
                ? <span className="text-xs text-muted-foreground">No data</span>
                : metrics.topOrigins.map(([r, n]) => (
                  <Badge key={r} variant="secondary" className="text-xs font-mono">{r} ({n})</Badge>
                ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Top Destinations</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {metrics.topDests.length === 0
                ? <span className="text-xs text-muted-foreground">No data</span>
                : metrics.topDests.map(([r, n]) => (
                  <Badge key={r} variant="secondary" className="text-xs font-mono">{r} ({n})</Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Countries & referrers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Top Countries</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {metrics.topCountries.length === 0
                ? <span className="text-xs text-muted-foreground">No data</span>
                : metrics.topCountries.map(([c, n]) => (
                  <Badge key={c} variant="secondary" className="text-xs">{c} ({n})</Badge>
                ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Top Referrers</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {metrics.topReferrers.length === 0
                ? <span className="text-xs text-muted-foreground">No data</span>
                : metrics.topReferrers.map(([r, n]) => (
                  <Badge key={r} variant="secondary" className="text-xs">{r} ({n})</Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent enquiries table */}
      <h2 className="text-sm font-medium mb-2">Recent enquiries</h2>
      <DataTable
        columns={columns}
        data={filteredEnquiries.slice(0, 100)}
        keyExtractor={(r) => r.id}
        emptyMessage={isLoading ? "Loading..." : "No charter enquiries yet"}
      />
    </div>
  );
}

export { TIME_RANGE_LABELS };
