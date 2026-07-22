import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { logConversion } from "@/lib/log-conversion";
import { useIsMobile } from "@/hooks/use-mobile";
import { format, addDays, differenceInDays, isBefore, isAfter, isSameDay } from "date-fns";
import { CalendarIcon, Search, Loader2, ChevronLeft, ChevronRight, X, Info } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger } from
"@/components/ui/popover";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { AirportCombobox, type AirportSelection } from "@/components/search/AirportCombobox";
import { LeadCaptureDialog, type LeadCaptureContext } from "@/components/search/LeadCaptureDialog";
import { SearchResultCard, SearchResultSkeleton } from "@/components/search/SearchResultCard";

import { EmptyStateWithActivity } from "@/components/search/RouteActivityView";
import { SearchSummaryBar } from "@/components/search/SearchSummaryBar";
import { InterpretiveHeader } from "@/components/search/InterpretiveHeader";
import { UpcomingEmptyLegs } from "@/components/search/UpcomingEmptyLegs";
import {
  useAirportsByIcaos,
  useAircraftTypesByIds,
} from "@/hooks/useClientSearch";
import {
  useHybridSearch,
  groupHybridResults,
  categorizeHybridResult,
  type HybridSearchParams,
  type HybridResult,
  type HybridSection,
} from "@/hooks/useHybridSearch";
import { useRouteActivity } from "@/hooks/useRouteActivity";

/** Map hybrid 4-section model to display 3-section model */
type DisplaySection = "exact" | "nearby" | "wider";

const SECTION_LABELS: Record<DisplaySection, string> = {
  exact: "Available on your route",
  nearby: "Options we can adapt to your route",
  wider: "Additional legs that may work"
};

function toDisplaySection(section: HybridSection): DisplaySection {
  if (section === "exact") return "exact";
  if (section === "nearby_airports") return "nearby";
  return "wider"; // same_area + wider → "wider"
}

type FlatItem = {
  type: "header";
  section: DisplaySection;
  result?: undefined;
} | {
  type: "result";
  section: DisplaySection;
  result: HybridResult;
};

const MAX_DATE_RANGE_DAYS = 14;
const PAGE_SIZE = 25;

/** Fire-and-forget count sync with retry + keepalive */
async function syncSearchCounts(
  logId: string,
  payload: { result_count: number; exact_count: number; nearby_count: number; wider_count: number },
  maxRetries = 2
) {
  const logUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/log-search`;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(logUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search_log_id: logId, ...payload }),
        keepalive: true,
      });
      const data = await resp.json();
      if (data.ok) return true;
    } catch {
      // retry
    }
    if (attempt < maxRetries) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  return false;
}

export function ClientSearchView() {
  const isMobile = useIsMobile();
  const sessionId = useRef(crypto.randomUUID()).current;
  const searchLogIdRef = useRef<string | null>(null);
  const [searchLogId, setSearchLogId] = useState<string | null>(null);
  // Promise that resolves to the search log ID for the current search
  const logIdPromiseRef = useRef<Promise<string | null>>(Promise.resolve(null));
  // Track sync status per search run to allow multi-attempt syncing
  const searchRunIdRef = useRef(0);
  const syncedRunRef = useRef(0);

  // Fire Google Ads conversion event on page visit
  useEffect(() => {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'conversion', {
        send_to: 'AW-746813872/AFUtCJKe4PkbELDzjeQC',
        value: 1.0,
        currency: 'USD',
      });
    }
  }, []);

  // Input state
  const [origin, setOrigin] = useState<AirportSelection | null>(null);
  const [destination, setDestination] = useState<AirportSelection | null>(null);
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Lead capture dialog state
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [leadContext, setLeadContext] = useState<LeadCaptureContext | null>(null);

  // Search state
  const [searchParams, setSearchParams] = useState<HybridSearchParams | null>(null);
  const [page, setPage] = useState(1);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [formCollapsed, setFormCollapsed] = useState(false);

  // Route activity fallback state
  const [showRouteActivity, setShowRouteActivity] = useState(false);

  const canSearch = origin && destination && dateRange?.from;

  // Helper to compute counts and sync
  const doSync = useCallback(async (results: HybridResult[], runId: number) => {
    if (syncedRunRef.current >= runId) return; // already synced this run

    let exactCount = 0, nearbyCount = 0, widerCount = 0;
    for (const r of results) {
      const section = categorizeHybridResult(r);
      if (section === "exact") exactCount++;
      else if (section === "nearby_airports") nearbyCount++;
      else widerCount++; // same_area + wider
    }

    const payload = {
      result_count: results.length,
      exact_count: exactCount,
      nearby_count: nearbyCount,
      wider_count: widerCount,
    };

    const logId = await logIdPromiseRef.current;
    if (!logId) return;

    const ok = await syncSearchCounts(logId, payload);
    if (ok) syncedRunRef.current = runId;
  }, []);

  const executeSearch = useCallback(() => {
    if (!origin || !destination || !dateRange?.from) return;

    const dateStart = format(dateRange.from, "yyyy-MM-dd");
    const dateEnd = format(dateRange.to ?? dateRange.from, "yyyy-MM-dd");

    // Increment search run
    const runId = ++searchRunIdRef.current;
    syncedRunRef.current = 0; // reset sync tracking

    setSearchParams({
      originIcao: origin.icao,
      destIcao: destination.icao,
      dateStart,
      dateEnd,
      includeNearby: true
    });
    setPage(1);
    setShowRouteActivity(false);
    setFormCollapsed(true);

    // Fire-and-forget search log — store promise for backfill to await
    const logUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/log-search`;
    searchLogIdRef.current = null;
    setSearchLogId(null);
    const logPromise = fetch(logUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin_icao: origin.icao,
        destination_icao: destination.icao,
        origin_label: origin.label.split(" — ")[0] || origin.icao,
        destination_label: destination.label.split(" — ")[0] || destination.icao,
        date_start: dateStart,
        date_end: dateEnd,
        include_nearby: true,
        session_id: sessionId,
        user_agent: navigator.userAgent,
        referrer: document.referrer || null,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        const id = d.id || null;
        if (id) { searchLogIdRef.current = id; setSearchLogId(id); }
        return id as string | null;
      })
      .catch(() => null as string | null);
    logIdPromiseRef.current = logPromise;
  }, [origin, destination, dateRange, sessionId]);

  const handleSearch = useCallback(() => {
    executeSearch();
  }, [executeSearch]);

  const handleEditSearch = useCallback(() => {
    setFormCollapsed(false);
  }, []);

  // Date range selection with 14-day max
  const handleDateRangeSelect = useCallback((range: DateRange | undefined) => {
    if (dateRange?.from && dateRange?.to) {
      setDateRange(undefined);
      return;
    }
    if (!range?.from) {
      setDateRange(undefined);
      return;
    }
    if (range.to && differenceInDays(range.to, range.from) > MAX_DATE_RANGE_DAYS - 1) {
      setDateRange({
        from: range.from,
        to: addDays(range.from, MAX_DATE_RANGE_DAYS - 1)
      });
      return;
    }
    setDateRange(range);
  }, [dateRange]);

  const handleClearDateRange = useCallback(() => {
    setDateRange(undefined);
  }, []);

  // Format date range for display
  const formatDateRangeDisplay = useCallback((range: DateRange | undefined) => {
    if (!range?.from) return "Select travel dates";

    const formatWithOrdinal = (date: Date) => {
      const day = date.getDate();
      const suffix =
      day % 10 === 1 && day !== 11 ? "st" :
      day % 10 === 2 && day !== 12 ? "nd" :
      day % 10 === 3 && day !== 13 ? "rd" : "th";
      return format(date, `EEEE MMMM d'${suffix}', yyyy`);
    };

    if (!range.to || isSameDay(range.from, range.to)) {
      return formatWithOrdinal(range.from);
    }

    const sameYear = range.from.getFullYear() === range.to.getFullYear();
    if (sameYear) {
      const fromDay = range.from.getDate();
      const fromSuffix =
      fromDay % 10 === 1 && fromDay !== 11 ? "st" :
      fromDay % 10 === 2 && fromDay !== 12 ? "nd" :
      fromDay % 10 === 3 && fromDay !== 13 ? "rd" : "th";
      return `${format(range.from, `EEEE MMMM d'${fromSuffix}'`)} - ${formatWithOrdinal(range.to)}`;
    }

    return `${formatWithOrdinal(range.from)} - ${formatWithOrdinal(range.to)}`;
  }, []);

  // Short date display for summary bar
  const formatDateRangeShort = useCallback((range: DateRange | undefined) => {
    if (!range?.from) return "";
    const startStr = format(range.from, "EEE MMM d");
    if (!range.to || isSameDay(range.from, range.to)) return startStr;
    return `${startStr} – ${format(range.to, "EEE MMM d")}`;
  }, []);

  const disabledDays = useCallback((date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isBefore(date, today)) return true;
    if (dateRange?.from && !dateRange.to) {
      const maxDate = addDays(dateRange.from, MAX_DATE_RANGE_DAYS - 1);
      if (isAfter(date, maxDate) && !isSameDay(date, dateRange.from)) {
        return true;
      }
    }
    return false;
  }, [dateRange]);

  // Hybrid search (corridor + radius)
  const {
    data: rawResults,
    corridorResults,
    radiusResults,
    isLoading,
    isLoadingRadius,
    error,
    radiusError,
  } = useHybridSearch(searchParams);

  // Derived counts for display
  const exactCount = useMemo(
    () => corridorResults.filter((r) => r.origin_depth === 0 && r.dest_depth === 0).length,
    [corridorResults]
  );
  const nearbyAndCorridorCount = useMemo(
    () => rawResults.length - exactCount,
    [rawResults, exactCount]
  );

  // Attempt A: sync after corridor results settle (even if radius is still loading)
  const exactSyncDoneRef = useRef(false);
  useEffect(() => {
    if (searchParams) { exactSyncDoneRef.current = false; }
  }, [searchParams]);

  useEffect(() => {
    if (isLoading || !corridorResults || exactSyncDoneRef.current) return;
    exactSyncDoneRef.current = true;
    // Only sync corridor-only counts if radius hasn't finished yet
    if (isLoadingRadius && corridorResults.length > 0) {
      const runId = searchRunIdRef.current;
      doSync(corridorResults, runId);
    }
  }, [isLoading, corridorResults, isLoadingRadius, doSync]);

  // Attempt B: sync after ALL results settle (final counts)
  useEffect(() => {
    if (isLoading || isLoadingRadius || !rawResults) return;
    const runId = searchRunIdRef.current;
    doSync(rawResults, runId);
  }, [isLoading, isLoadingRadius, rawResults, doSync]);

  // Group and paginate — map 4 hybrid sections → 3 display sections
  const { paginatedItems, totalPages, totalResults } = useMemo(() => {
    if (!rawResults || rawResults.length === 0) {
      return { paginatedItems: [] as FlatItem[], totalPages: 0, totalResults: 0 };
    }

    const hybridGroups = groupHybridResults(rawResults, true);

    // Collapse into 3 display sections, preserving order
    const displayMap = new Map<DisplaySection, HybridResult[]>();
    for (const g of hybridGroups) {
      const ds = toDisplaySection(g.section);
      const existing = displayMap.get(ds) || [];
      existing.push(...g.results);
      displayMap.set(ds, existing);
    }

    // Flatten into FlatItem[] with headers
    const flattened: FlatItem[] = [];
    const sectionOrder: DisplaySection[] = ["exact", "nearby", "wider"];
    for (const ds of sectionOrder) {
      const results = displayMap.get(ds);
      if (!results || results.length === 0) continue;
      flattened.push({ type: "header", section: ds });
      for (const r of results) {
        flattened.push({ type: "result", section: ds, result: r });
      }
    }

    // Paginate
    const totalResults = rawResults.length;
    const totalPages = Math.ceil(flattened.filter((i) => i.type === "result").length / PAGE_SIZE);

    // Find which items belong on this page (headers + results)
    let resultCount = 0;
    const startResult = (page - 1) * PAGE_SIZE;
    const endResult = startResult + PAGE_SIZE;
    const items: FlatItem[] = [];
    let lastHeader: FlatItem | null = null;

    for (const item of flattened) {
      if (item.type === "header") {
        lastHeader = item;
        continue;
      }
      if (resultCount >= startResult && resultCount < endResult) {
        if (lastHeader) {
          items.push(lastHeader);
          lastHeader = null;
        }
        items.push(item);
      }
      resultCount++;
    }

    return { paginatedItems: items, totalPages, totalResults };
  }, [rawResults, page]);

  // Route activity
  const routeActivityParams = useMemo(() => {
    if (!searchParams) return null;
    return {
      originIcao: searchParams.originIcao,
      destIcao: searchParams.destIcao,
      userDateStart: searchParams.dateStart,
      userDateEnd: searchParams.dateEnd
    };
  }, [searchParams]);

  const hasSearched = searchParams !== null;
  const showEmptyStateWithActivity = hasSearched && !isLoading && !isLoadingRadius && totalResults === 0;

  const {
    data: routeActivityData,
    rawData: routeActivityRawData,
    isLoading: isLoadingRouteActivity,
    isError: isRouteActivityError,
    hasData: hasRouteActivityData,
    refetch: refetchRouteActivity
  } = useRouteActivity(routeActivityParams, showEmptyStateWithActivity);

  // Auto-expand the activity panel when alternate-date matches are available.
  // Tracked by a ref so we only auto-expand once per route activity result.
  const autoExpandedKeyRef = useRef<string | null>(null);
  const hasAlternateDateMatches = useMemo(
    () =>
      routeActivityData.some(
        (d) =>
          d.section === "other_dates" ||
          d.section === "other_dates_exact" ||
          d.section === "other_dates_similar"
      ),
    [routeActivityData]
  );
  const wasAutoExpandedForThisSearch = useRef(false);
  useEffect(() => {
    if (!showEmptyStateWithActivity) {
      wasAutoExpandedForThisSearch.current = false;
      return;
    }
    if (
      !showRouteActivity &&
      !isLoadingRouteActivity &&
      !isRouteActivityError &&
      hasRouteActivityData &&
      hasAlternateDateMatches
    ) {
      const key = `${searchParams?.originIcao}-${searchParams?.destIcao}-${searchParams?.dateStart}-${searchParams?.dateEnd}`;
      if (autoExpandedKeyRef.current !== key) {
        autoExpandedKeyRef.current = key;
        wasAutoExpandedForThisSearch.current = true;
        setShowRouteActivity(true);
      }
    }
  }, [
    showEmptyStateWithActivity,
    showRouteActivity,
    isLoadingRouteActivity,
    isRouteActivityError,
    hasRouteActivityData,
    hasAlternateDateMatches,
    searchParams,
  ]);

  // Airport lookups
  const icaosToFetch = useMemo(() => {
    const icaos: string[] = [];
    if (rawResults) {
      for (const r of rawResults) {
        if (r.departure_airport_icao) icaos.push(r.departure_airport_icao);
        if (r.arrival_airport_icao) icaos.push(r.arrival_airport_icao);
      }
    }
    if (showRouteActivity && routeActivityRawData) {
      for (const r of routeActivityRawData) {
        if (r.departure_airport_icao) icaos.push(r.departure_airport_icao);
        if (r.arrival_airport_icao) icaos.push(r.arrival_airport_icao);
      }
    }
    return icaos;
  }, [rawResults, showRouteActivity, routeActivityRawData]);

  const { data: airportsMap, isLoading: isLoadingAirports } = useAirportsByIcaos(icaosToFetch);

  const aircraftTypeIds = useMemo(() => {
    const ids: string[] = [];
    if (rawResults) {
      for (const r of rawResults) {
        if (r.aircraft_type_id) ids.push(r.aircraft_type_id);
      }
    }
    return ids;
  }, [rawResults]);

  const { data: aircraftTypesMap } = useAircraftTypesByIds(aircraftTypeIds);

  // Safety sync (Attempt C): when user opens lead dialog, ensure counts are synced
  const handleOpenLeadDialog = useCallback((context: LeadCaptureContext, source: string, conversionParams: Parameters<typeof logConversion>[0]) => {
    setLeadContext(context);
    setLeadDialogOpen(true);
    logConversion({ ...conversionParams, source });

    // Safety: if counts not yet synced for this run, try now
    if (rawResults && syncedRunRef.current < searchRunIdRef.current) {
      doSync(rawResults, searchRunIdRef.current);
    }
  }, [rawResults, doSync]);

  return (
    <>
      {/* Summary Bar (shown when form is collapsed after search) */}
      {formCollapsed && hasSearched && origin && destination &&
      <SearchSummaryBar
        originLabel={origin.label.split(" — ")[0] || origin.icao}
        destinationLabel={destination.label.split(" — ")[0] || destination.icao}
        dateDisplay={formatDateRangeShort(dateRange)}
        onEdit={handleEditSearch} />
      }

      {/* Tagline (shown above the search form when not collapsed) */}
      {!formCollapsed &&
      <p className="text-center mb-4 text-primary text-lg font-serif font-bold" style={{ fontFamily: "Georgia, 'Times New Roman', serif", color: '#b7a369' }}>Search current Empty Leg availability or sign up to receive alerts when your
 requested route & date preferences become available
      </p>
      }

      {/* Search Form (hidden when collapsed) */}
      {!formCollapsed &&
      <Card className="mb-6 border-border/40 shadow-sm">
          <CardContent className="pt-6">
            <div className="space-y-6">
              {/* Origin & Destination */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider font-bold" style={{ color: '#b7a369' }}>Origin</Label>
                  <AirportCombobox
                  value={origin}
                  onChange={setOrigin}
                  placeholder="Select departure airport..."
                  className="w-full border-border/30 shadow-none" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider font-bold" style={{ color: '#b7a369' }}>Destination</Label>
                  <AirportCombobox
                  value={destination}
                  onChange={setDestination}
                  placeholder="Select arrival airport..."
                  className="w-full border-border/30 shadow-none" />
                </div>
              </div>

              {/* Travel Window */}
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-bold" style={{ color: '#b7a369' }}>Travel Window</Label>
                <p className="text-xs text-muted-foreground/60">
                  Select a single day or a range (up to 14 days)
                </p>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal border-border/30 shadow-none",
                      !dateRange?.from && "text-muted-foreground"
                    )}>
                      <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0 text-muted-foreground/60" />
                      <span className="truncate">{formatDateRangeDisplay(dateRange)}</span>
                      {dateRange?.from &&
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearDateRange();
                      }}
                      className="ml-auto flex-shrink-0 p-1 hover:bg-muted rounded"
                      aria-label="Clear dates">
                          <X className="h-3 w-3" />
                        </button>
                    }
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <div className="flex items-center justify-between p-3 border-b">
                      <p className="text-xs text-muted-foreground">
                        Click a date for exact match, or select up to 14 days
                      </p>
                      <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCalendarOpen(false)}
                      className="h-7 text-xs ml-2">
                        Close
                      </Button>
                    </div>
                    <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={handleDateRangeSelect}
                    disabled={disabledDays}
                    numberOfMonths={isMobile ? 1 : 2}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Search Button */}
              <Button
              onClick={handleSearch}
              disabled={!canSearch || isLoading}
              size="lg"
              className="w-full md:w-auto">
                {isLoading ?
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> :
              <Search className="mr-2 h-4 w-4" />
              }
                Search Flights
              </Button>
            </div>
          </CardContent>
        </Card>
      }

      {/* Upcoming Empty Legs dropdown (shown when form is visible and no search has been executed) */}
      {!formCollapsed && !searchParams && <UpcomingEmptyLegs />}

      {/* Error */}
      {error &&
      <Alert variant="destructive" className="mb-6">
          <AlertDescription>
            {error instanceof Error ? error.message : "An error occurred while searching."}
          </AlertDescription>
        </Alert>
      }

      {/* Loading State */}
      {isLoading &&
      <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) =>
        <SearchResultSkeleton key={i} />
        )}
        </div>
      }

      {/* Results */}
      {hasSearched && !isLoading && !error &&
      <div className="space-y-4">
          {/* Interpretive Header */}
          <InterpretiveHeader
          totalResults={totalResults}
          exactCount={exactCount}
          nearbyCount={nearbyAndCorridorCount}
          isLoadingExpanded={isLoadingRadius} />

          {/* Subtle count (secondary) */}
          {totalResults > 0 &&
        <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground/60">
                {exactCount} direct{nearbyAndCorridorCount > 0 ? ` · ${nearbyAndCorridorCount} similar` : ""}
              </p>
              {totalPages > 1 &&
          <p className="text-xs text-muted-foreground/60">
                  Page {page} of {totalPages}
                </p>
          }
            </div>
        }

          {/* Empty State with Route Activity Fallback */}
          {showEmptyStateWithActivity &&
        <EmptyStateWithActivity
          onShowActivity={() => setShowRouteActivity(true)}
          showActivity={showRouteActivity}
          autoExpanded={wasAutoExpandedForThisSearch.current}
          isLoading={isLoadingRouteActivity}
          isError={isRouteActivityError}
          hasActivityData={hasRouteActivityData}
          onRetry={refetchRouteActivity}
          data={routeActivityData}
          airportsMap={airportsMap || {}}
          isLoadingAirports={isLoadingAirports}
          onWatchRoute={() => {
            if (!searchParams || !origin || !destination) return;
            const ctx: LeadCaptureContext = {
              requestType: "route_watch",
              originIcao: searchParams.originIcao,
              destinationIcao: searchParams.destIcao,
              originLabel: origin.label.split(" — ")[0] || origin.icao,
              destinationLabel: destination.label.split(" — ")[0] || destination.icao,
              travelStartDate: searchParams.dateStart,
              travelEndDate: searchParams.dateEnd,
              sessionId,
              searchLogId: searchLogIdRef.current,
            };
            handleOpenLeadDialog(ctx, "route_watch_cta", {
              sessionId,
              searchLogId: searchLogIdRef.current,
              eventType: "dialog_opened",
              requestType: "route_watch",
            });
          }}
          onRequestAvailability={(resultId, matchSection) => {
            if (!searchParams || !origin || !destination) return;
            const activityResult = routeActivityRawData?.find(r => r.id === resultId);
            const depIcao = activityResult?.departure_airport_icao;
            const arrIcao = activityResult?.arrival_airport_icao;
            const depAirport = depIcao && airportsMap?.[depIcao];
            const arrAirport = arrIcao && airportsMap?.[arrIcao];
            const depLabel = depAirport ? (depAirport.city || depAirport.name || depIcao) : depIcao || "Unknown";
            const arrLabel = arrAirport ? (arrAirport.city || arrAirport.name || arrIcao) : arrIcao || "Unknown";
            const isNonDirect = matchSection === "nearby" || matchSection === "wider";
            const ctx: LeadCaptureContext = {
              requestType: "leg_inquiry",
              originIcao: searchParams.originIcao,
              destinationIcao: searchParams.destIcao,
              originLabel: origin.label.split(" — ")[0] || origin.icao,
              destinationLabel: destination.label.split(" — ")[0] || destination.icao,
              travelStartDate: searchParams.dateStart,
              travelEndDate: searchParams.dateEnd,
              emptyLegId: resultId,
              matchSection: isNonDirect ? matchSection : undefined,
              emptyLegRouteLabel: isNonDirect ? `${depLabel} → ${arrLabel}` : undefined,
              sessionId,
              searchLogId: searchLogIdRef.current,
            };
            handleOpenLeadDialog(ctx, "route_activity", {
              sessionId,
              searchLogId: searchLogIdRef.current,
              eventType: "dialog_opened",
              requestType: "leg_inquiry",
              matchSection: matchSection || null,
              emptyLegId: resultId,
            });
          }} />
        }

          {/* Results List */}
          {paginatedItems.length > 0 &&
        <div className="space-y-3">
              {paginatedItems.map((item, idx) => {
            if (item.type === "header") {
              const isNonDirectSection = item.section === "nearby" || item.section === "wider";
              return (
                <div key={`header-${item.section}-${idx}`} className="pt-8 first:pt-0">
                      {/* "Your route" anchor above non-direct sections */}
                      {isNonDirectSection && origin && destination && searchParams && (
                        <div className="mb-3 rounded-md bg-muted/50 border border-border/40 px-3 py-2 text-sm">
                          <div className="flex items-center gap-2 text-foreground">
                            <span className="font-medium">Your route:</span>
                            <span>{origin.label.split(" — ")[0]}</span>
                            <span className="text-foreground/40">→</span>
                            <span>{destination.label.split(" — ")[0]}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Travel window: {format(new Date(searchParams.dateStart), "MMM d")} – {format(new Date(searchParams.dateEnd), "MMM d")}
                          </div>
                        </div>
                      )}
                      <h3 className="text-base font-semibold text-foreground">
                        {SECTION_LABELS[item.section]}
                      </h3>
                      {isNonDirectSection && (
                        <p className="text-xs text-muted-foreground/70 mt-1">Often a short reposition from your requested airports.</p>
                      )}
                    </div>);
            }
            return (
              <SearchResultCard
                key={item.result!.id}
                result={item.result!}
                airportsMap={airportsMap || {}}
                isLoadingAirports={isLoadingAirports}
                aircraftTypesMap={aircraftTypesMap || {}}
                matchSection={item.section}
                onRequestAvailability={(resultId) => {
                  if (!searchParams || !origin || !destination) return;
                  const r = item.result!;
                  const depAirport = r.departure_airport_icao && airportsMap?.[r.departure_airport_icao];
                  const depLabel = depAirport
                    ? (depAirport.city || depAirport.name || r.departure_airport_icao)
                    : r.departure_location_raw || r.departure_corridor || r.departure_airport_icao || "Unknown";
                  const arrAirport = r.arrival_airport_icao && airportsMap?.[r.arrival_airport_icao];
                  const arrLabel = arrAirport
                    ? (arrAirport.city || arrAirport.name || r.arrival_airport_icao)
                    : r.arrival_location_raw || r.arrival_corridor || r.arrival_airport_icao || "Unknown";
                  const ctx: LeadCaptureContext = {
                    requestType: "leg_inquiry",
                    originIcao: searchParams.originIcao,
                    destinationIcao: searchParams.destIcao,
                    originLabel: origin.label.split(" — ")[0] || origin.icao,
                    destinationLabel: destination.label.split(" — ")[0] || destination.icao,
                    travelStartDate: searchParams.dateStart,
                    travelEndDate: searchParams.dateEnd,
                    emptyLegId: resultId,
                    matchSection: item.section,
                    emptyLegRouteLabel: `${depLabel} → ${arrLabel}`,
                    sessionId,
                    searchLogId: searchLogIdRef.current,
                  };
                  handleOpenLeadDialog(ctx, "search_results", {
                    sessionId,
                    searchLogId: searchLogIdRef.current,
                    eventType: "dialog_opened",
                    requestType: "leg_inquiry",
                    matchSection: item.section || null,
                    emptyLegId: resultId,
                  });
                }} />);
          })}
            </div>
        }

          {/* Radius search warning */}
          {radiusError &&
        <Alert className="mt-4 border-border/40">
              <Info className="h-4 w-4" />
              <AlertDescription className="flex flex-col gap-3">
                <span>
                  {radiusError.message.includes("timeout") || radiusError.message.includes("too long") ?
              "That search is taking too long. Try narrowing your dates or adjusting your route." :
              radiusError.message}
                </span>
              </AlertDescription>
            </Alert>
        }

          {/* Pagination */}
          {totalPages > 1 &&
        <div className="flex items-center justify-center gap-2 pt-4">
              <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="border-border/40">
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground/60 px-2">
                {page} / {totalPages}
              </span>
              <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="border-border/40">
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
        }
        </div>
      }

      {/* Lead Capture Dialog */}
      <LeadCaptureDialog
        open={leadDialogOpen}
        onOpenChange={setLeadDialogOpen}
        context={leadContext} />
    </>);
}
