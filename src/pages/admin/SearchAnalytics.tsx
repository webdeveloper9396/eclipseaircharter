import { useState, useMemo, useCallback } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, subDays, subYears, startOfDay, isAfter } from "date-fns";
import { Trash2, ShieldBan, ChevronDown, ChevronUp, Smartphone, Monitor, Eye, CheckCircle2, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminSelect } from "@/lib/admin-proxy";
import type { EmptyLeg, Operator } from "@/integrations/external-supabase/types";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { MetricTile } from "@/components/dashboard/MetricTile";
import { DataTable, type Column } from "@/components/dashboard/DataTable";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CharterAnalyticsTab } from "@/components/admin/CharterAnalyticsTab";
import { useToast } from "@/hooks/use-toast";

function isMobileUserAgent(ua: string | null): boolean {
  if (!ua) return false;
  return /Mobile|Android|iPhone|iPad|iPod|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua);
}

interface SearchLog {
  id: string;
  created_at: string;
  origin_icao: string;
  destination_icao: string;
  origin_label: string | null;
  destination_label: string | null;
  date_start: string;
  date_end: string;
  include_nearby: boolean;
  result_count: number | null;
  exact_count: number | null;
  nearby_count: number | null;
  wider_count: number | null;
  ip_address: string | null;
  session_id: string | null;
  user_agent: string | null;
  referrer: string | null;
}

interface ExcludedIp {
  id: string;
  ip_address: string;
  label: string | null;
  created_at: string;
}

interface SearchConversion {
  id: string;
  created_at: string;
  session_id: string;
  search_log_id: string | null;
  event_type: string;
  request_type: string | null;
  match_section: string | null;
  empty_leg_id: string | null;
}

type TimeRange = "today" | "7d" | "30d" | "60d" | "90d" | "180d" | "1y" | "all";

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

export default function SearchAnalytics() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showExcluded, setShowExcluded] = useState(false);
  const [excludeDialogOpen, setExcludeDialogOpen] = useState(false);
  const [excludeIp, setExcludeIp] = useState("");
  const [excludeLabel, setExcludeLabel] = useState("");
  const [ipsOpen, setIpsOpen] = useState(false);
  const [deviceFilter, setDeviceFilter] = useState<"all" | "mobile" | "desktop">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");

  // Fetch search logs
  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["search-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("search_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as SearchLog[];
    },
  });

  // Fetch conversions
  const { data: conversions = [] } = useQuery({
    queryKey: ["search-conversions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("search_conversions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data as SearchConversion[];
    },
  });

  // Fetch excluded IPs
  const { data: excludedIps = [] } = useQuery({
    queryKey: ["excluded-ips"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("excluded_ips")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ExcludedIp[];
    },
  });

  const normalizeIp = (ip: string) => {
    let normalized = ip.trim();
    if (normalized.startsWith("::ffff:")) {
      normalized = normalized.slice(7);
    }
    return normalized;
  };

  const excludedIpSet = useMemo(
    () => new Set(excludedIps.map((e) => normalizeIp(e.ip_address))),
    [excludedIps]
  );

  // Filtered logs
  const filteredLogs = useMemo(() => {
    let result = logs;
    if (!showExcluded) {
      result = result.filter((l) => !l.ip_address || !excludedIpSet.has(normalizeIp(l.ip_address)));
    }
    if (deviceFilter !== "all") {
      result = result.filter((l) => {
        const mobile = isMobileUserAgent(l.user_agent);
        return deviceFilter === "mobile" ? mobile : !mobile;
      });
    }
    return result;
  }, [logs, showExcluded, excludedIpSet, deviceFilter]);

  // Reset page when filters change
  const handleDeviceFilterChange = useCallback((v: "all" | "mobile" | "desktop") => {
    setDeviceFilter(v);
    setCurrentPage(1);
  }, []);

  const handleShowExcludedChange = useCallback((v: boolean) => {
    setShowExcluded(v);
    setCurrentPage(1);
  }, []);

  const handlePageSizeChange = useCallback((v: string) => {
    setPageSize(Number(v));
    setCurrentPage(1);
  }, []);

  // Paginated data
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  // Build conversion lookup by search_log_id
  const conversionByLogId = useMemo(() => {
    const map = new Map<string, { dialogOpened: boolean; formSubmitted: boolean; legIds: Set<string> }>();
    for (const c of conversions) {
      if (!c.search_log_id) continue;
      const existing = map.get(c.search_log_id) || { dialogOpened: false, formSubmitted: false, legIds: new Set<string>() };
      if (c.event_type === "dialog_opened") existing.dialogOpened = true;
      if (c.event_type === "form_submitted") existing.formSubmitted = true;
      if (c.empty_leg_id) existing.legIds.add(c.empty_leg_id);
      map.set(c.search_log_id, existing);
    }
    return map;
  }, [conversions]);

  // Time-range-filtered logs and conversions
  const timeRangeFilteredLogs = useMemo(() => {
    const cutoff = getTimeRangeCutoff(timeRange);
    if (!cutoff) return filteredLogs;
    return filteredLogs.filter((l) => isAfter(new Date(l.created_at), cutoff));
  }, [filteredLogs, timeRange]);

  // Build a set of search_log_ids from excluded IPs so we can filter conversions too
  const excludedLogIds = useMemo(() => {
    if (showExcluded) return new Set<string>();
    const set = new Set<string>();
    for (const l of logs) {
      if (l.ip_address && excludedIpSet.has(normalizeIp(l.ip_address))) {
        set.add(l.id);
      }
    }
    return set;
  }, [logs, excludedIpSet, showExcluded]);

  const timeRangeFilteredConversions = useMemo(() => {
    const cutoff = getTimeRangeCutoff(timeRange);
    let result = conversions;
    // Exclude conversions linked to excluded IPs
    if (excludedLogIds.size > 0) {
      result = result.filter((c) => !c.search_log_id || !excludedLogIds.has(c.search_log_id));
    }
    if (!cutoff) return result;
    return result.filter((c) => isAfter(new Date(c.created_at), cutoff));
  }, [conversions, timeRange, excludedLogIds]);

  // Popular legs — aggregate clicks from conversions with empty_leg_id (time-filtered)
  const popularLegsAgg = useMemo(() => {
    const legMap = new Map<string, { clicks: number; submissions: number; sections: Set<string>; routes: Set<string> }>();
    for (const c of timeRangeFilteredConversions) {
      if (!c.empty_leg_id) continue;
      const existing = legMap.get(c.empty_leg_id) || { clicks: 0, submissions: 0, sections: new Set(), routes: new Set() };
      if (c.event_type === "dialog_opened") existing.clicks++;
      if (c.event_type === "form_submitted") existing.submissions++;
      if (c.match_section) existing.sections.add(c.match_section);
      if (c.search_log_id) {
        const log = logs.find(l => l.id === c.search_log_id);
        if (log) existing.routes.add(`${log.origin_icao} → ${log.destination_icao}`);
      }
      legMap.set(c.empty_leg_id, existing);
    }
    return Array.from(legMap.entries())
      .map(([legId, data]) => ({
        legId,
        clicks: data.clicks,
        submissions: data.submissions,
        sections: Array.from(data.sections),
        routes: Array.from(data.routes),
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);
  }, [timeRangeFilteredConversions, logs]);

  // Fetch empty leg details from external DB
  const popularLegIds = useMemo(() => popularLegsAgg.map(l => l.legId), [popularLegsAgg]);

  const { data: legDetailsMap = {} } = useQuery({
    queryKey: ["popular-leg-details", popularLegIds],
    enabled: popularLegIds.length > 0,
    queryFn: async () => {
      const { data } = await adminSelect<EmptyLeg[]>({
        table: "empty_legs",
        columns: "*",
        filters: [{ col: "id", op: "in", value: popularLegIds }],
      });
      const legs = (data || []) as EmptyLeg[];

      if (legs.length === 0) return {};

      const operatorIds = [...new Set(legs.map(l => l.operator_id))];
      const { data: opData } = await adminSelect<Operator[]>({
        table: "operators",
        columns: "*",
        filters: [{ col: "id", op: "in", value: operatorIds }],
      });
      const operators = (opData || []) as Operator[];

      const opMap = new Map(operators.map(o => [o.id, o.name]));

      const map: Record<string, { route: string; aircraft: string; dates: string; operator: string }> = {};
      for (const leg of legs) {
        const dep = leg.departure_airport_icao || "???";
        const arr = leg.arrival_airport_icao || "???";
        const dateStart = leg.departure_date_start;
        const dateEnd = leg.departure_date_end;
        const dates = dateStart === dateEnd ? dateStart : `${dateStart} – ${dateEnd}`;
        map[leg.id] = {
          route: `${dep} → ${arr}`,
          aircraft: leg.aircraft_model || leg.aircraft_category || "Unknown",
          dates,
          operator: opMap.get(leg.operator_id) || "Unknown",
        };
      }
      return map;
    },
  });


  const popularLegs = useMemo(() =>
    popularLegsAgg.map(l => ({ ...l, details: legDetailsMap[l.legId] || null })),
    [popularLegsAgg, legDetailsMap]
  );

  // Collect all unique leg IDs from conversions on the current page
  const pageConversionLegIds = useMemo(() => {
    const ids = new Set<string>();
    for (const log of paginatedLogs) {
      const conv = conversionByLogId.get(log.id);
      if (conv) {
        for (const lid of conv.legIds) ids.add(lid);
      }
    }
    return Array.from(ids);
  }, [paginatedLogs, conversionByLogId]);

  // Fetch leg details for per-row conversions (separate from popular legs)
  const { data: rowLegDetailsMap = {} } = useQuery({
    queryKey: ["row-leg-details", pageConversionLegIds],
    enabled: pageConversionLegIds.length > 0,
    queryFn: async () => {
      const { data } = await adminSelect<EmptyLeg[]>({
        table: "empty_legs",
        columns: "*",
        filters: [{ col: "id", op: "in", value: pageConversionLegIds }],
      });
      const legs = (data || []) as EmptyLeg[];
      if (legs.length === 0) return {};

      const operatorIds = [...new Set(legs.map(l => l.operator_id))];
      const { data: opData } = await adminSelect<Operator[]>({
        table: "operators",
        columns: "*",
        filters: [{ col: "id", op: "in", value: operatorIds }],
      });
      const operators = (opData || []) as Operator[];
      const opMap = new Map(operators.map(o => [o.id, o.name]));

      const map: Record<string, { route: string; aircraft: string; dates: string; operator: string }> = {};
      for (const leg of legs) {
        const dep = leg.departure_airport_icao || "???";
        const arr = leg.arrival_airport_icao || "???";
        const dateStart = leg.departure_date_start;
        const dateEnd = leg.departure_date_end;
        const dates = dateStart === dateEnd ? dateStart : `${dateStart} – ${dateEnd}`;
        map[leg.id] = {
          route: `${dep} → ${arr}`,
          aircraft: leg.aircraft_model || leg.aircraft_category || "Unknown",
          dates,
          operator: opMap.get(leg.operator_id) || "Unknown",
        };
      }
      return map;
    },
  });


  // Metrics (time-range aware)
  const metrics = useMemo(() => {
    let zeroResults = 0;
    let withResultCount = 0;
    let mobileCount = 0;
    const routeMap = new Map<string, number>();

    for (const log of timeRangeFilteredLogs) {
      if (isMobileUserAgent(log.user_agent)) mobileCount++;

      if (log.result_count !== null) {
        withResultCount++;
        if (log.result_count === 0) zeroResults++;
      }

      const route = `${log.origin_icao} → ${log.destination_icao}`;
      routeMap.set(route, (routeMap.get(route) || 0) + 1);
    }

    const topRoutes = Array.from(routeMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const zeroRate = withResultCount > 0 ? Math.round((zeroResults / withResultCount) * 100) : 0;
    const mobilePercent = timeRangeFilteredLogs.length > 0 ? Math.round((mobileCount / timeRangeFilteredLogs.length) * 100) : 0;

    // Conversion metrics
    const dialogOpens = timeRangeFilteredConversions.filter((c) => c.event_type === "dialog_opened").length;
    const formSubmissions = timeRangeFilteredConversions.filter((c) => c.event_type === "form_submitted").length;
    const totalSearches = timeRangeFilteredLogs.length;
    const conversionRate = totalSearches > 0 ? ((formSubmissions / totalSearches) * 100).toFixed(1) : "0";

    return { totalSearches, zeroRate, topRoutes, mobilePercent, dialogOpens, formSubmissions, conversionRate };
  }, [timeRangeFilteredLogs, timeRangeFilteredConversions]);

  // Exclude IP mutation
  const excludeMutation = useMutation({
    mutationFn: async ({ ip, label }: { ip: string; label: string }) => {
      const { error } = await supabase
        .from("excluded_ips")
        .insert({ ip_address: ip, label: label || null });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["excluded-ips"] });
      toast({ title: "IP excluded" });
      setExcludeDialogOpen(false);
      setExcludeIp("");
      setExcludeLabel("");
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  // Remove excluded IP
  const removeExclusionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("excluded_ips").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["excluded-ips"] });
      toast({ title: "IP exclusion removed" });
    },
  });

  const handleExcludeIp = (ip: string) => {
    setExcludeIp(ip);
    setExcludeLabel("");
    setExcludeDialogOpen(true);
  };

  const columns: Column<SearchLog>[] = [
    {
      key: "created_at",
      header: "Time",
      render: (r) => (
        <span className="text-xs whitespace-nowrap">
          {format(new Date(r.created_at), "MMM d, HH:mm")}
        </span>
      ),
    },
    {
      key: "route",
      header: "Route",
      render: (r) => (
        <span className="text-xs font-mono">
          {r.origin_icao} → {r.destination_icao}
        </span>
      ),
    },
    {
      key: "dates",
      header: "Dates",
      render: (r) => (
        <span className="text-xs whitespace-nowrap">
          {r.date_start === r.date_end ? r.date_start : `${r.date_start} – ${r.date_end}`}
        </span>
      ),
    },
    {
      key: "result_count",
      header: "Results",
      render: (r) => {
        const conv = conversionByLogId.get(r.id);
        const isPending = r.result_count === null;
        return (
          <div className="flex flex-col">
            {isPending ? (
              <span className="text-xs font-mono text-muted-foreground italic">
                {conv ? "Sync pending" : "—"}
              </span>
            ) : (
              <span className={`text-xs font-mono ${r.result_count === 0 ? "text-destructive" : ""}`}>
                {r.result_count}
              </span>
            )}
            {r.result_count !== null && r.result_count > 0 && r.exact_count !== null && (
              <span className="text-[10px] text-muted-foreground">
                {r.exact_count}e · {r.nearby_count ?? 0}n · {r.wider_count ?? 0}w
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "conversion",
      header: "Conversion",
      render: (r) => {
        const conv = conversionByLogId.get(r.id);
        if (!conv) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {conv.dialogOpened && (
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="inline-flex">
                    <Badge variant="secondary" className="text-[10px] gap-0.5 px-1.5 cursor-pointer">
                      <Eye className="h-3 w-3" /> Opened
                    </Badge>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto max-w-xs p-3" side="bottom" align="start">
                  {conv.legIds.size > 0 ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-foreground">Clicked legs</span>
                      {Array.from(conv.legIds).map((lid) => {
                        const d = rowLegDetailsMap[lid];
                        if (!d) return <span key={lid} className="text-xs text-muted-foreground">Loading…</span>;
                        return (
                          <span key={lid} className="text-xs text-muted-foreground leading-tight">
                            {d.route} · {d.aircraft} · {d.dates} · {d.operator}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No leg details</span>
                  )}
                </PopoverContent>
              </Popover>
            )}
            {conv.formSubmitted && (
              <Badge variant="default" className="text-[10px] gap-0.5 px-1.5">
                <CheckCircle2 className="h-3 w-3" /> Submitted
              </Badge>
            )}
          </div>
        );
      },
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
    {
      key: "ip_address",
      header: "IP",
      render: (r) => (
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono">{r.ip_address || "—"}</span>
          {r.ip_address && !excludedIpSet.has(normalizeIp(r.ip_address)) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={(e) => {
                e.stopPropagation();
                handleExcludeIp(r.ip_address!);
              }}
            >
              <ShieldBan className="h-3 w-3 text-muted-foreground" />
            </Button>
          )}
        </div>
      ),
    },
    {
      key: "referrer",
      header: "Referrer",
      render: (r) => (
        <span className="text-xs truncate max-w-[150px] block">
          {r.referrer || "—"}
        </span>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <PageHeader
        title="Search Analytics"
        description="Public search activity, conversions, and IP management"
      />

      {/* Time Range Selector (shared across tabs) */}
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {(Object.keys(TIME_RANGE_LABELS) as TimeRange[]).map((key) => (
          <Button
            key={key}
            variant={timeRange === key ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs px-3"
            onClick={() => setTimeRange(key)}
          >
            {TIME_RANGE_LABELS[key]}
          </Button>
        ))}
      </div>

      <Tabs defaultValue="empty_legs" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="empty_legs">Empty Legs Search</TabsTrigger>
          <TabsTrigger value="charter">Charter Enquiries</TabsTrigger>
        </TabsList>

        <TabsContent value="charter">
          <CharterAnalyticsTab timeRange={timeRange} />
        </TabsContent>

        <TabsContent value="empty_legs">

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricTile label="Searches" value={metrics.totalSearches} />
        <MetricTile label="Zero-result rate" value={`${metrics.zeroRate}%`} />
        <MetricTile label="Dialog opens" value={metrics.dialogOpens} icon={<Eye className="h-4 w-4" />} />
        <MetricTile label="Submissions" value={metrics.formSubmissions} icon={<CheckCircle2 className="h-4 w-4" />} />
        <MetricTile label="Conversion rate" value={`${metrics.conversionRate}%`} sublabel={`submissions / ${TIME_RANGE_LABELS[timeRange].toLowerCase()} searches`} />
        <MetricTile label="Mobile" value={`${metrics.mobilePercent}%`} icon={<Smartphone className="h-4 w-4" />} />
      </div>

      {/* Funnel Card */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Conversion Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 text-sm">
            <div className="text-center">
              <p className="text-2xl font-semibold tabular-nums">{metrics.totalSearches}</p>
              <p className="text-xs text-muted-foreground">Searches</p>
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="text-center">
              <p className="text-2xl font-semibold tabular-nums">{metrics.dialogOpens}</p>
              <p className="text-xs text-muted-foreground">Dialog opens</p>
              {metrics.totalSearches > 0 && (
                <p className="text-[10px] text-muted-foreground/60">
                  {((metrics.dialogOpens / metrics.totalSearches) * 100).toFixed(1)}%
                </p>
              )}
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="text-center">
              <p className="text-2xl font-semibold tabular-nums">{metrics.formSubmissions}</p>
              <p className="text-xs text-muted-foreground">Submissions</p>
              {metrics.dialogOpens > 0 && (
                <p className="text-[10px] text-muted-foreground/60">
                  {((metrics.formSubmissions / metrics.dialogOpens) * 100).toFixed(1)}% of opens
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top Routes */}
      {metrics.topRoutes.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Top Routes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {metrics.topRoutes.map(([route, count]) => (
                <Badge key={route} variant="secondary" className="text-xs">
                  {route} ({count})
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Popular Legs */}
      {popularLegs.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Most Clicked Legs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {popularLegs.map((leg) => (
                <div key={leg.legId} className="flex items-center justify-between rounded-md border p-3 gap-3">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    {leg.details ? (
                      <>
                        <span className="text-sm font-mono font-medium">{leg.details.route}</span>
                        <span className="text-xs text-muted-foreground">
                          {leg.details.aircraft} · {leg.details.dates}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Operator: {leg.details.operator}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs font-mono text-muted-foreground">{leg.legId}</span>
                    )}
                    {leg.routes.length > 0 && (
                      <span className="text-[10px] text-muted-foreground/70">
                        Searched via: {leg.routes.slice(0, 3).join(", ")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {leg.sections.map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                    ))}
                    <Badge variant="secondary" className="text-[10px] gap-0.5">
                      <Eye className="h-3 w-3" /> {leg.clicks}
                    </Badge>
                    {leg.submissions > 0 && (
                      <Badge variant="default" className="text-[10px] gap-0.5">
                        <CheckCircle2 className="h-3 w-3" /> {leg.submissions}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Switch checked={showExcluded} onCheckedChange={handleShowExcludedChange} id="show-excluded" />
          <Label htmlFor="show-excluded" className="text-sm">Show excluded IPs</Label>
        </div>
        <Select value={deviceFilter} onValueChange={handleDeviceFilterChange}>
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All devices</SelectItem>
            <SelectItem value="mobile">Mobile only</SelectItem>
            <SelectItem value="desktop">Desktop only</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 ml-auto">
          <Label className="text-sm text-muted-foreground">Rows</Label>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="w-[80px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Log Table */}
      <DataTable
        columns={columns}
        data={paginatedLogs}
        keyExtractor={(r) => r.id}
        emptyMessage={logsLoading ? "Loading..." : "No search logs yet"}
      />

      {/* Pagination */}
      {filteredLogs.length > pageSize && (
        <div className="flex items-center justify-between mt-3 text-sm">
          <span className="text-muted-foreground">
            {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredLogs.length)} of {filteredLogs.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Excluded IPs Manager */}
      <Collapsible open={ipsOpen} onOpenChange={setIpsOpen} className="mt-6">
        <div className="flex items-center gap-2">
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              Excluded IPs ({excludedIps.length})
              {ipsOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </CollapsibleTrigger>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setExcludeIp("");
              setExcludeLabel("");
              setExcludeDialogOpen(true);
            }}
          >
            + Add IP
          </Button>
        </div>
        <CollapsibleContent className="mt-3">
          {excludedIps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No excluded IPs</p>
          ) : (
            <div className="space-y-2">
              {excludedIps.map((ip) => (
                <div key={ip.id} className="flex items-center justify-between rounded-md border p-2">
                  <div>
                    <span className="text-sm font-mono">{ip.ip_address}</span>
                    {ip.label && (
                      <span className="ml-2 text-xs text-muted-foreground">({ip.label})</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => removeExclusionMutation.mutate(ip.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Exclude IP Dialog */}
      <Dialog open={excludeDialogOpen} onOpenChange={setExcludeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exclude IP Address</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">IP Address</Label>
              <Input
                value={excludeIp}
                onChange={(e) => setExcludeIp(e.target.value)}
                disabled={excludedIpSet.has(excludeIp)}
                className="font-mono"
                placeholder="e.g. 192.168.1.1"
              />
            </div>
            <div>
              <Label className="text-xs">Label (optional)</Label>
              <Input
                value={excludeLabel}
                onChange={(e) => setExcludeLabel(e.target.value)}
                placeholder="e.g. Office, VPN, Bot..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcludeDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => excludeMutation.mutate({ ip: excludeIp, label: excludeLabel })}
              disabled={excludeMutation.isPending}
            >
              Exclude
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
