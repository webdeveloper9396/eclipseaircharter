import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { format, addDays, differenceInDays, isBefore, isAfter, isSameDay } from "date-fns";
import { CalendarIcon, Search, Loader2, ChevronLeft, ChevronRight, X, Radar } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { AirportCombobox, type AirportSelection } from "@/components/search/AirportCombobox";
import { BrokerSearchResultCard } from "@/components/search/BrokerSearchResultCard";
import { SearchResultSkeleton } from "@/components/search/SearchResultCard";
import { EmptyStateWithActivity } from "@/components/search/RouteActivityView";
import { SearchSummaryBar } from "@/components/search/SearchSummaryBar";
import { InterpretiveHeader } from "@/components/search/InterpretiveHeader";
import {
  useAirportsByIcaos,
  useAircraftTypesByIds,
} from "@/hooks/useClientSearch";
import {
  useHybridSearch,
  groupHybridResults,
  type HybridSearchParams,
  type HybridResult,
  type HybridSection,
} from "@/hooks/useHybridSearch";
import { useRouteActivity } from "@/hooks/useRouteActivity";
import { useOperators } from "@/hooks/useExternalData";

// Map hybrid sections to 3 broker display sections
type BrokerDisplaySection = "exact" | "nearby" | "corridor";

const BROKER_SECTION_LABELS: Record<BrokerDisplaySection, string> = {
  exact: "Available on your route",
  nearby: "Options we can adapt to your route",
  corridor: "Additional legs that may work",
};

function toBrokerSection(section: HybridSection): BrokerDisplaySection {
  if (section === "exact") return "exact";
  if (section === "nearby_airports") return "nearby";
  return "corridor"; // same_area + wider
}

const MAX_DATE_RANGE_DAYS = 14;
const PAGE_SIZE = 25;

type FlatItem =
  | { type: "header"; section: BrokerDisplaySection }
  | { type: "result"; section: BrokerDisplaySection; result: HybridResult };

export function BrokerSearchView() {
  const isMobile = useIsMobile();

  // Input state
  const [origin, setOrigin] = useState<AirportSelection | null>(null);
  const [destination, setDestination] = useState<AirportSelection | null>(null);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Search state
  const [searchParams, setSearchParams] = useState<HybridSearchParams | null>(null);
  const [page, setPage] = useState(1);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [formCollapsed, setFormCollapsed] = useState(false);

  // Route activity fallback state
  const [showRouteActivity, setShowRouteActivity] = useState(false);

  const canSearch = origin && destination && dateRange?.from;

  const executeSearch = useCallback(() => {
    if (!origin || !destination || !dateRange?.from) return;
    const dateStart = format(dateRange.from, "yyyy-MM-dd");
    const dateEnd = format(dateRange.to ?? dateRange.from, "yyyy-MM-dd");

    setSearchParams({
      originIcao: origin.icao,
      destIcao: destination.icao,
      dateStart,
      dateEnd,
      includeNearby: true,
    });
    setPage(1);
    setShowRouteActivity(false);
    setFormCollapsed(true);
  }, [origin, destination, dateRange]);

  const handleSearch = useCallback(() => executeSearch(), [executeSearch]);
  const handleEditSearch = useCallback(() => setFormCollapsed(false), []);

  const handleDateRangeSelect = useCallback(
    (range: DateRange | undefined) => {
      if (dateRange?.from && dateRange?.to) {
        setDateRange(undefined);
        return;
      }
      if (!range?.from) {
        setDateRange(undefined);
        return;
      }
      if (range.to && differenceInDays(range.to, range.from) > MAX_DATE_RANGE_DAYS - 1) {
        setDateRange({ from: range.from, to: addDays(range.from, MAX_DATE_RANGE_DAYS - 1) });
        return;
      }
      setDateRange(range);
    },
    [dateRange]
  );

  const handleClearDateRange = useCallback(() => setDateRange(undefined), []);

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
    if (!range.to || isSameDay(range.from, range.to)) return formatWithOrdinal(range.from);
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

  const formatDateRangeShort = useCallback((range: DateRange | undefined) => {
    if (!range?.from) return "";
    const startStr = format(range.from, "EEE MMM d");
    if (!range.to || isSameDay(range.from, range.to)) return startStr;
    return `${startStr} – ${format(range.to, "EEE MMM d")}`;
  }, []);

  const disabledDays = useCallback(
    (date: Date) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (isBefore(date, today)) return true;
      if (dateRange?.from && !dateRange.to) {
        const maxDate = addDays(dateRange.from, MAX_DATE_RANGE_DAYS - 1);
        if (isAfter(date, maxDate) && !isSameDay(date, dateRange.from)) return true;
      }
      return false;
    },
    [dateRange]
  );

  // Hybrid search (corridor + radius)
  const {
    data: allResults,
    corridorResults,
    radiusResults,
    isLoading,
    isLoadingRadius,
    error,
    radiusError,
  } = useHybridSearch(searchParams);

  const hasSearched = searchParams !== null;

  // Group into hybrid sections, then collapse to 3 broker display sections
  const { paginatedItems, totalPages, totalResults, exactCount, nearbyCount, corridorCount } = useMemo(() => {
    if (!allResults || allResults.length === 0)
      return { paginatedItems: [] as FlatItem[], totalPages: 0, totalResults: 0, exactCount: 0, nearbyCount: 0, corridorCount: 0 };

    const groups = groupHybridResults(allResults, true);

    // Collapse into 3 broker sections
    const brokerGroups: { section: BrokerDisplaySection; results: HybridResult[] }[] = [];
    const merged: Record<BrokerDisplaySection, HybridResult[]> = { exact: [], nearby: [], corridor: [] };

    for (const g of groups) {
      const bs = toBrokerSection(g.section);
      merged[bs].push(...g.results);
    }

    if (merged.exact.length > 0) brokerGroups.push({ section: "exact", results: merged.exact });
    if (merged.nearby.length > 0) brokerGroups.push({ section: "nearby", results: merged.nearby });
    if (merged.corridor.length > 0) brokerGroups.push({ section: "corridor", results: merged.corridor });

    // Flatten for pagination
    const flat: FlatItem[] = [];
    for (const g of brokerGroups) {
      flat.push({ type: "header", section: g.section });
      for (const r of g.results) {
        flat.push({ type: "result", section: g.section, result: r });
      }
    }

    const resultItems = flat.filter((f): f is FlatItem & { type: "result" } => f.type === "result");
    const total = resultItems.length;
    const tp = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const startIdx = (page - 1) * PAGE_SIZE;
    const endIdx = startIdx + PAGE_SIZE;
    const pageResultIds = new Set(resultItems.slice(startIdx, endIdx).map((r) => r.result.id));

    const items: FlatItem[] = [];
    let currentSection: BrokerDisplaySection | null = null;
    for (const item of flat) {
      if (item.type === "header") {
        currentSection = item.section;
      } else if (pageResultIds.has(item.result.id)) {
        if (currentSection && !items.some((i) => i.type === "header" && i.section === currentSection)) {
          items.push({ type: "header", section: currentSection });
        }
        items.push(item);
      }
    }

    return {
      paginatedItems: items,
      totalPages: tp,
      totalResults: total,
      exactCount: merged.exact.length,
      nearbyCount: merged.nearby.length,
      corridorCount: merged.corridor.length,
    };
  }, [allResults, page]);

  const showEmptyStateWithActivity = hasSearched && !isLoading && !isLoadingRadius && totalResults === 0;

  // Route activity
  const routeActivityParams = useMemo(() => {
    if (!searchParams) return null;
    return {
      originIcao: searchParams.originIcao,
      destIcao: searchParams.destIcao,
      userDateStart: searchParams.dateStart,
      userDateEnd: searchParams.dateEnd,
    };
  }, [searchParams]);

  const {
    data: routeActivityData,
    rawData: routeActivityRawData,
    isLoading: isLoadingRouteActivity,
    isError: isRouteActivityError,
    hasData: hasRouteActivityData,
    refetch: refetchRouteActivity,
  } = useRouteActivity(routeActivityParams, showEmptyStateWithActivity);

  // Auto-expand activity panel when alternate-date matches exist.
  const autoExpandedKeyRef = useRef<string | null>(null);
  const wasAutoExpandedForThisSearch = useRef(false);
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
    for (const r of allResults) {
      if (r.departure_airport_icao) icaos.push(r.departure_airport_icao);
      if (r.arrival_airport_icao) icaos.push(r.arrival_airport_icao);
    }
    if (showRouteActivity && routeActivityRawData) {
      for (const r of routeActivityRawData) {
        if (r.departure_airport_icao) icaos.push(r.departure_airport_icao);
        if (r.arrival_airport_icao) icaos.push(r.arrival_airport_icao);
      }
    }
    return icaos;
  }, [allResults, showRouteActivity, routeActivityRawData]);

  const { data: airportsMap, isLoading: isLoadingAirports } = useAirportsByIcaos(icaosToFetch);

  const aircraftTypeIds = useMemo(() => {
    return [...new Set(allResults.map((r) => r.aircraft_type_id).filter(Boolean))] as string[];
  }, [allResults]);

  const { data: aircraftTypesMap } = useAircraftTypesByIds(aircraftTypeIds);

  // Operators map
  const { data: operators } = useOperators();
  const operatorsMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const op of operators || []) map[op.id] = op.name;
    return map;
  }, [operators]);

  return (
    <>
      {/* Summary Bar */}
      {formCollapsed && hasSearched && origin && destination && (
        <SearchSummaryBar
          originLabel={origin.label.split(" — ")[0] || origin.icao}
          destinationLabel={destination.label.split(" — ")[0] || destination.icao}
          dateDisplay={formatDateRangeShort(dateRange)}
          onEdit={handleEditSearch}
        />
      )}

      {/* Search Form */}
      {!formCollapsed && (
        <Card className="mb-6 border-border/40 shadow-sm">
          <CardContent className="pt-6">
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider font-medium text-muted-foreground">Origin</Label>
                  <AirportCombobox
                    value={origin}
                    onChange={setOrigin}
                    placeholder="Select departure airport..."
                    className="w-full border-border/30 shadow-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider font-medium text-muted-foreground">Destination</Label>
                  <AirportCombobox
                    value={destination}
                    onChange={setDestination}
                    placeholder="Select arrival airport..."
                    className="w-full border-border/30 shadow-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wider font-medium text-muted-foreground">Travel Window</Label>
                <p className="text-xs text-muted-foreground/60">Select a single day or a range (up to 14 days)</p>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal border-border/30 shadow-none",
                        !dateRange?.from && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 flex-shrink-0 text-muted-foreground/60" />
                      <span className="truncate">{formatDateRangeDisplay(dateRange)}</span>
                      {dateRange?.from && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleClearDateRange(); }}
                          className="ml-auto flex-shrink-0 p-1 hover:bg-muted rounded"
                          aria-label="Clear dates"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
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
                        className="h-7 text-xs ml-2"
                      >
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
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <Button
                onClick={handleSearch}
                disabled={!canSearch || isLoading}
                size="lg"
                className="w-full md:w-auto"
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                Search Flights
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>
            {error instanceof Error ? error.message : "An error occurred while searching."}
          </AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <SearchResultSkeleton key={i} />)}
        </div>
      )}

      {/* Results */}
      {hasSearched && !isLoading && !error && (
        <div className="space-y-4">
          <InterpretiveHeader
            totalResults={totalResults}
            exactCount={exactCount}
            nearbyCount={nearbyCount + corridorCount}
            isLoadingExpanded={isLoadingRadius}
          />

          {totalResults > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground/60">
                {exactCount} direct
                {nearbyCount > 0 && ` · ${nearbyCount} nearby`}
                {corridorCount > 0 && ` · ${corridorCount} corridor`}
                {isLoadingRadius && (
                  <span className="inline-flex items-center gap-1 ml-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                  </span>
                )}
              </p>
              {totalPages > 1 && (
                <p className="text-xs text-muted-foreground/60">Page {page} of {totalPages}</p>
              )}
            </div>
          )}

          {/* Empty State with Route Activity Fallback */}
          {showEmptyStateWithActivity && (
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
              showBrokerDetails
              operatorsMap={operatorsMap}
            />
          )}

          {/* Results List */}
          {paginatedItems.length > 0 && (
            <div className="space-y-3">
              {paginatedItems.map((item, idx) => {
                if (item.type === "header") {
                  const isNonExact = item.section !== "exact";
                  return (
                    <div key={`header-${item.section}-${idx}`} className="pt-8 first:pt-0">
                      {isNonExact && origin && destination && searchParams && (
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
                        {BROKER_SECTION_LABELS[item.section]}
                      </h3>
                      {isNonExact && (
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Often a short reposition from your requested airports.
                        </p>
                      )}
                    </div>
                  );
                }

                const r = item.result;
                const isRadius = r._source === "radius";

                return (
                  <div key={r.id}>
                    <BrokerSearchResultCard
                      result={r}
                      airportsMap={airportsMap || {}}
                      isLoadingAirports={isLoadingAirports}
                      aircraftTypesMap={aircraftTypesMap || {}}
                      operatorsMap={operatorsMap}
                    />
                    {/* Radius reposition details - desktop */}
                    {isRadius && (r.origin_reposition_nm != null || r.dest_reposition_nm != null) && (
                      <div className="mt-1 ml-[172px] hidden sm:flex items-center gap-3 text-[11px] text-muted-foreground">
                        <Radar className="h-3 w-3 shrink-0 text-accent-foreground/60" />
                        <span>
                          Reposition:
                          {r.origin_reposition_nm != null && (
                            <> {Math.round(r.origin_reposition_nm)}nm origin</>
                          )}
                          {r.origin_reposition_nm != null && r.dest_reposition_nm != null && ","}
                          {r.dest_reposition_nm != null && (
                            <> {Math.round(r.dest_reposition_nm)}nm destination</>
                          )}
                          {r.total_reposition_nm != null && (
                            <> ({Math.round(r.total_reposition_nm)}nm total)</>
                          )}
                        </span>
                      </div>
                    )}
                    {/* Radius reposition details - mobile */}
                    {isRadius && (r.origin_reposition_nm != null || r.dest_reposition_nm != null) && (
                      <div className="mt-1 sm:hidden flex items-center gap-2 text-[11px] text-muted-foreground px-1">
                        <Radar className="h-3 w-3 shrink-0" />
                        <span>
                          {r.origin_reposition_nm != null && <>{Math.round(r.origin_reposition_nm)}nm orig</>}
                          {r.origin_reposition_nm != null && r.dest_reposition_nm != null && " · "}
                          {r.dest_reposition_nm != null && <>{Math.round(r.dest_reposition_nm)}nm dest</>}
                          {r.total_reposition_nm != null && <> · {Math.round(r.total_reposition_nm)}nm total</>}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Radius loading indicator */}
          {isLoadingRadius && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching nearby airports...
            </div>
          )}

          {/* Radius error (non-fatal) */}
          {radiusError && !error && (
            <Alert className="mt-4 border-border/40">
              <AlertDescription>
                <span>
                  {radiusError.message.includes("timeout") || radiusError.message.includes("too long")
                    ? "Nearby airport search took too long. Showing direct and corridor results only."
                    : radiusError.message}
                </span>
              </AlertDescription>
            </Alert>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="border-border/40"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground/60 px-2">{page} / {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="border-border/40"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
