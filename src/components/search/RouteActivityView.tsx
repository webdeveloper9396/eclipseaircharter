/**
 * Route Activity Fallback View
 * 
 * This component displays historical route activity when the user's search
 * returns zero results. It's designed to reduce anxiety by showing that
 * the route has activity, even if nothing matches the specific travel window.
 * 
 * Design principles (OneWay doctrine):
 * - Calm, honest, non-pressuring
 * - Never implies availability
 * - Informational only - no CTAs
 * - Results are non-interactive
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { Plane, Calendar, Clock, ChevronDown, ChevronUp, Loader2, AlertCircle, Building2, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Airport } from "@/integrations/external-supabase/types";
import type { RouteActivityResult, RouteActivitySection, CategorizedRouteActivity } from "@/hooks/useRouteActivity";
import { formatAirportShort } from "./AirportCombobox";

const EXTERNAL_STORAGE_BASE =
  "https://zhjkexhurxafsurnsetw.supabase.co/storage/v1/object/public/aircraft-type-images/";

function getImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return EXTERNAL_STORAGE_BASE + path;
}

function AircraftThumbnail({
  path,
  interiorPath,
  className,
}: {
  path: string | null | undefined;
  interiorPath?: string | null;
  className?: string;
}) {
  const [exteriorErrored, setExteriorErrored] = useState(false);
  const [interiorErrored, setInteriorErrored] = useState(false);
  const [activeSlot, setActiveSlot] = useState<"exterior" | "interior">("exterior");

  const extUrl = getImageUrl(path ?? null);
  const intUrl = getImageUrl(interiorPath ?? null);
  const hasToggle = !!extUrl && !exteriorErrored && !!intUrl && !interiorErrored;

  const handleClick = () => {
    if (hasToggle) setActiveSlot((s) => (s === "exterior" ? "interior" : "exterior"));
  };

  const showExt = extUrl && !exteriorErrored;
  const showInt = intUrl && !interiorErrored;

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded bg-muted/40 ${className ?? ""} ${hasToggle ? "cursor-pointer" : ""}`}
      onClick={handleClick}
    >
      {showExt && (
        <img
          src={extUrl}
          alt="Aircraft exterior"
          loading="lazy"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ease-in-out ${activeSlot === "exterior" ? "opacity-100" : "opacity-0"}`}
          onError={() => setExteriorErrored(true)}
        />
      )}
      {showInt && (
        <img
          src={intUrl}
          alt="Aircraft interior"
          loading="lazy"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ease-in-out ${activeSlot === "interior" ? "opacity-100" : "opacity-0"}`}
          onError={() => setInteriorErrored(true)}
        />
      )}
      {!showExt && !showInt && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Plane className="h-4 w-4 text-muted-foreground/25" />
        </div>
      )}
      {hasToggle && (
        <div className="absolute bottom-1 right-1 flex gap-1 pointer-events-none">
          <span className={`block h-1.5 w-1.5 rounded-full transition-colors duration-200 ${activeSlot === "exterior" ? "bg-white" : "bg-white/40"}`} />
          <span className={`block h-1.5 w-1.5 rounded-full transition-colors duration-200 ${activeSlot === "interior" ? "bg-white" : "bg-white/40"}`} />
        </div>
      )}
    </div>
  );
}

// Section labels and descriptions
const SECTION_CONFIG: Record<RouteActivitySection, {
  label: string;
  description?: string;
}> = {
  sold: {
    label: "Recently sold along this route",
    description: "Availability can change quickly as underlying trips are confirmed.",
  },
  expired: {
    label: "Recently expired",
  },
  other_dates: {
    label: "Other available dates along this route",
  },
  other_dates_exact: {
    label: "Other available dates on your route",
  },
  other_dates_similar: {
    label: "Similar availability — can be requoted",
    description: "These legs are on nearby routes and can often be adjusted to your requested route.",
  },
};

interface RouteActivityViewProps {
  isLoading: boolean;
  error: Error | null;
  data: CategorizedRouteActivity[];
  airportsMap: Record<string, Airport>;
  isLoadingAirports: boolean;
  prioritizeOtherDates?: boolean;
  onRequestAvailability?: (resultId: string, matchSection?: "exact" | "nearby" | "wider") => void;
  /** Broker-only: show operator + price line under each row */
  showBrokerDetails?: boolean;
  operatorsMap?: Record<string, string>;
}

/**
 * Parse a date-only string (YYYY-MM-DD) as local midnight
 * This avoids timezone shifts when the server returns date-only values
 */
function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a date for display: "Wed Feb 4" or "Wed Feb 4 – Fri Feb 6"
 */
function formatDateWindow(start: string, end: string): string {
  // Use safe date parsing to avoid timezone-induced off-by-one errors
  const startDate = parseDateOnly(start);
  const endDate = parseDateOnly(end);
  
  const startFormatted = format(startDate, "EEE MMM d");
  const endFormatted = format(endDate, "EEE MMM d");
  
  if (startFormatted === endFormatted) {
    return startFormatted;
  }
  return `${startFormatted} – ${endFormatted}`;
}

/**
 * Format sold/expired date for status line
 * For date-only strings (YYYY-MM-DD), parse safely to avoid timezone shift
 * For timestamps with time, use standard parsing
 */
function formatStatusDate(dateStr: string): string {
  // Check if it's a date-only string (no 'T' separator)
  const date = dateStr.includes("T") 
    ? new Date(dateStr) 
    : parseDateOnly(dateStr);
  return format(date, "EEE MMM d");
}

/**
 * Format category: snake_case to Title Case
 */
function formatCategory(category: string | null): string {
  if (!category) return "";
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Format airport from map
 */
function formatAirportFromMap(
  icao: string | null,
  airportsMap: Record<string, Airport>,
  isLoading: boolean
): React.ReactNode {
  if (!icao) return <span className="text-muted-foreground">Unknown</span>;
  
  if (isLoading) {
    return <Skeleton className="h-4 w-32 inline-block" />;
  }

  const airport = airportsMap[icao];
  if (!airport) {
    return <span className="font-mono">{icao}</span>;
  }

  return <span>{formatAirportShort(airport)}</span>;
}

/**
 * Get status badge variant and text
 * 
 * Note on "Marked sold" wording:
 * We use "Marked sold on..." because `sold_detected_at` represents when our system
 * detected the leg was sold, not necessarily the actual moment of sale.
 * This is more honest and aligns with OneWay doctrine.
 */
function getStatusInfo(section: RouteActivitySection, result: RouteActivityResult): {
  variant: "secondary" | "outline";
  text: string;
  subtext: string;
} {
  switch (section) {
    case "sold":
      return {
        variant: "secondary",
        text: "Sold",
        subtext: result.sold_detected_at 
          ? `Marked sold on ${formatStatusDate(result.sold_detected_at)}`
          : "Marked sold recently",
      };
    case "expired":
      return {
        variant: "outline",
        text: "Expired",
        subtext: `Expired on ${formatStatusDate(result.departure_date_end)}`,
      };
    case "other_dates":
    case "other_dates_exact":
    case "other_dates_similar": {
      const distance = formatDistanceToNow(new Date(result.last_seen_at), { addSuffix: false });
      return {
        variant: "outline",
        text: "Active",
        subtext: `Seen ${distance} ago`,
      };
    }
  }
}

interface ActivityRowProps {
  result: RouteActivityResult;
  section: RouteActivitySection;
  airportsMap: Record<string, Airport>;
  isLoadingAirports: boolean;
  onRequestAvailability?: (resultId: string, matchSection?: "exact" | "nearby" | "wider") => void;
  showBrokerDetails?: boolean;
  operatorsMap?: Record<string, string>;
}

function formatPrice(price: number | null | undefined, currency: string | null | undefined): string {
  if (price === null || price === undefined) return "Price on request";
  return (
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price) +
    " " +
    (currency || "USD")
  );
}

function ActivityRow({ result, section, airportsMap, isLoadingAirports, onRequestAvailability, showBrokerDetails, operatorsMap }: ActivityRowProps) {
  const statusInfo = getStatusInfo(section, result);
  const isInactive = section === "sold" || section === "expired";
  const aircraftModel = result.aircraft_model || "Aircraft TBD";
  const category = formatCategory(result.aircraft_category);
  const operatorName = showBrokerDetails && result.operator_id
    ? (operatorsMap?.[result.operator_id] ?? result.operator_id)
    : null;
  const priceDisplay = showBrokerDetails ? formatPrice(result.price, result.price_currency) : null;

  return (
    <div 
      className={cn(
        "rounded-lg border transition-colors overflow-hidden",
        isInactive 
          ? "border-border/20 bg-muted/30 opacity-40" 
          : "border-border bg-card"
      )}
    >
      {/* Mobile thumbnail strip */}
      <div className="sm:hidden w-full aspect-video relative bg-muted/40">
        <AircraftThumbnail
          path={result.exterior_image_path}
          interiorPath={result.interior_image_path}
          className="w-full h-full rounded-none"
        />
      </div>

      <div className="p-4">
        {/* Desktop: thumbnail left + content right */}
        <div className="hidden sm:flex gap-4 items-center">
          <AircraftThumbnail
            path={result.exterior_image_path}
            interiorPath={result.interior_image_path}
            className="w-[160px] h-[90px] shrink-0"
          />

          <div className="flex flex-col gap-2 flex-1 min-w-0">
            {/* Row 1 — Route */}
            <div className="flex items-center gap-2 text-sm">
              <Plane className="h-4 w-4 text-foreground/40 shrink-0" />
              <span className="font-semibold text-foreground">
                {formatAirportFromMap(result.departure_airport_icao, airportsMap, isLoadingAirports)}
              </span>
              <span className="text-foreground/40">→</span>
              <span className="font-semibold text-foreground">
                {formatAirportFromMap(result.arrival_airport_icao, airportsMap, isLoadingAirports)}
              </span>
            </div>

            {/* Row 2 — Core details */}
            <div className="flex items-center gap-5 text-sm">
              <div className="flex items-center gap-1.5 text-foreground/70">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span>{formatDateWindow(result.departure_date_start, result.departure_date_end)}</span>
              </div>
              <span className="text-foreground/70">{aircraftModel}</span>
              <span className="text-muted-foreground">{category || "—"}</span>
            </div>

            {/* Row 3 — Meta + action */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3 shrink-0" />
                <span>{statusInfo.subtext}</span>
              </div>
              {(section === "other_dates" || section === "other_dates_exact") && onRequestAvailability ? (
                <Button
                  size="sm"
                  className="text-xs shrink-0 border-none"
                  style={{ backgroundColor: "#b7a369", color: "#fff" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#a08f55")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#b7a369")}
                  onClick={() => onRequestAvailability(result.id, "exact")}
                >
                  Request availability
                </Button>
              ) : section === "other_dates_similar" && onRequestAvailability ? (
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <Button
                    size="sm"
                    className="text-xs border-none"
                    style={{ backgroundColor: "#b7a369", color: "#fff" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#a08f55")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#b7a369")}
                    onClick={() => onRequestAvailability(result.id, result.origin_depth <= 1 && result.dest_depth <= 1 ? "nearby" : "wider")}
                  >
                    Check for my route
                  </Button>
                  <span className="text-[10px] italic text-muted-foreground">Can often be adjusted</span>
                </div>
              ) : (
                <Badge variant={statusInfo.variant} className="shrink-0">
                  {statusInfo.text}
                </Badge>
              )}
            </div>

            {/* Broker-only: operator + price */}
            {showBrokerDetails && (
              <div className="flex items-center gap-6 pt-1 border-t border-border/40 mt-0.5">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
                  <Building2 className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                  <span className="font-medium text-foreground/80 truncate">{operatorName ?? "—"}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <DollarSign className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                  <span className={priceDisplay === "Price on request" ? "text-muted-foreground italic" : "font-medium text-foreground/80"}>
                    {priceDisplay}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile layout */}
        <div className="sm:hidden flex flex-col gap-2.5">
          {/* Row 1 — Route + badge */}
           <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-sm">
              <Plane className="h-3.5 w-3.5 text-foreground/40 shrink-0" />
              <span className="font-semibold text-foreground">
                {formatAirportFromMap(result.departure_airport_icao, airportsMap, isLoadingAirports)}
              </span>
              <span className="text-foreground/40">→</span>
              <span className="font-semibold text-foreground">
                {formatAirportFromMap(result.arrival_airport_icao, airportsMap, isLoadingAirports)}
              </span>
              {!(section === "other_dates" || section === "other_dates_exact" || section === "other_dates_similar") && (
                <Badge variant={statusInfo.variant} className="shrink-0 text-xs ml-auto">
                  {statusInfo.text}
                </Badge>
              )}
            </div>
            {(section === "other_dates" || section === "other_dates_exact") && onRequestAvailability && (
              <Button
                size="sm"
                className="text-xs w-full border-none"
                style={{ backgroundColor: "#b7a369", color: "#fff" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#a08f55")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#b7a369")}
                onClick={() => onRequestAvailability(result.id, "exact")}
              >
                Request availability
              </Button>
            )}
            {section === "other_dates_similar" && onRequestAvailability && (
              <Button
                size="sm"
                className="text-xs w-full border-none"
                style={{ backgroundColor: "#b7a369", color: "#fff" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#a08f55")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#b7a369")}
                onClick={() => onRequestAvailability(result.id, result.origin_depth <= 1 && result.dest_depth <= 1 ? "nearby" : "wider")}
              >
                Check for my route
              </Button>
            )}
          </div>
          {/* Row 2 — Core details */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>{formatDateWindow(result.departure_date_start, result.departure_date_end)}</span>
            </div>
            <span className="text-foreground/70">{aircraftModel}</span>
            {category && <span>{category}</span>}
          </div>
          {/* Row 3 — Meta */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{statusInfo.subtext}</span>
          </div>
          {/* Broker-only: operator + price (mobile) */}
          {showBrokerDetails && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 border-t border-border/40 mt-0.5">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="font-medium text-foreground/80">{operatorName ?? "—"}</span>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <DollarSign className="h-3 w-3 shrink-0" />
                <span className={priceDisplay === "Price on request" ? "italic" : "font-medium text-foreground/80"}>
                  {priceDisplay}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="sm:hidden w-full aspect-video bg-muted/40" />
      <div className="p-4">
        <div className="hidden sm:flex gap-4 items-center">
          <Skeleton className="w-[160px] h-[90px] shrink-0 rounded" />
          <div className="flex flex-col gap-2 flex-1">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-32" />
              <span className="text-muted-foreground">→</span>
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </div>
        <div className="sm:hidden flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-28" />
          </div>
          <Skeleton className="h-3 w-40" />
        </div>
      </div>
    </div>
  );
}

export function RouteActivityView({
  isLoading,
  error,
  data,
  airportsMap,
  isLoadingAirports,
  prioritizeOtherDates = false,
  onRequestAvailability,
  showBrokerDetails = false,
  operatorsMap,
}: RouteActivityViewProps) {
  const [otherDatesOpen, setOtherDatesOpen] = useState(false);

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4 mt-6 border-t border-border pt-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading route activity...</span>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <ActivitySkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Alert variant="destructive" className="mt-6">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Unable to load route activity. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  // No data
  if (data.length === 0) {
    return (
      <div className="mt-6 border-t border-border pt-6">
        <p className="text-sm text-muted-foreground text-center py-4">
          No recent activity found for this route.
        </p>
      </div>
    );
  }

  // When prioritizing other dates: reorder sections
  if (prioritizeOtherDates) {
    const otherDatesExact = data.filter((c) => c.section === "other_dates_exact");
    const otherDatesSimilar = data.filter((c) => c.section === "other_dates_similar");
    const otherDatesLegacy = data.filter((c) => c.section === "other_dates");
    const rest = data.filter((c) => c.section !== "other_dates" && c.section !== "other_dates_exact" && c.section !== "other_dates_similar");
    const activeSections = [...otherDatesExact, ...otherDatesSimilar, ...otherDatesLegacy];

    return (
      <div className="mt-6 border-t border-border pt-6 space-y-8">
        {/* Active date sections first, expanded */}
        {activeSections.map((category) => {
          const config = SECTION_CONFIG[category.section];
          return (
            <div key={category.section} className="space-y-3">
              <div>
                <h4 className="text-base font-semibold text-foreground">
                  {config.label}
                </h4>
                {config.description && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {config.description}
                  </p>
                )}
              </div>
              <div className="space-y-3">
                {category.results.map((result) => (
                  <ActivityRow
                    key={result.id}
                    result={result}
                    section={category.section}
                    airportsMap={airportsMap}
                    isLoadingAirports={isLoadingAirports}
                    onRequestAvailability={onRequestAvailability}
                    showBrokerDetails={showBrokerDetails}
                    operatorsMap={operatorsMap}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Sold/expired collapsed */}
        {rest.map((category) => {
          const config = SECTION_CONFIG[category.section];
          return (
            <Collapsible key={category.section}>
              <div className="space-y-3">
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors [&[data-state=open]>svg:first-child]:hidden [&[data-state=closed]>svg:last-child]:hidden">
                    <ChevronDown className="h-4 w-4" />
                    <ChevronUp className="h-4 w-4" />
                    <span>{config.label}</span>
                    <span className="font-normal">
                      ({category.results.length})
                    </span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3">
                  {config.description && (
                    <p className="text-xs text-muted-foreground">
                      {config.description}
                    </p>
                  )}
                  {category.results.map((result) => (
                    <ActivityRow
                      key={result.id}
                      result={result}
                      section={category.section}
                      airportsMap={airportsMap}
                      isLoadingAirports={isLoadingAirports}
                      onRequestAvailability={onRequestAvailability}
                      showBrokerDetails={showBrokerDetails}
                      operatorsMap={operatorsMap}
                    />
                  ))}
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>
    );
  }

  // Default rendering (scenario B)
  return (
      <div className="mt-6 border-t border-border pt-6 space-y-8">
      {data.map((category) => {
        const config = SECTION_CONFIG[category.section];
        
        if (category.section === "other_dates" || category.section === "other_dates_exact" || category.section === "other_dates_similar") {
          return (
            <Collapsible
              key={category.section}
              open={otherDatesOpen}
              onOpenChange={setOtherDatesOpen}
            >
              <div className="space-y-3">
                <CollapsibleTrigger asChild>
                  <button className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors">
                    {otherDatesOpen ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    <span>{config.label}</span>
                    <span className="text-muted-foreground font-normal">
                      ({category.results.length})
                    </span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3">
                  {category.results.map((result) => (
                    <ActivityRow
                      key={result.id}
                      result={result}
                      section={category.section}
                      airportsMap={airportsMap}
                      isLoadingAirports={isLoadingAirports}
                      onRequestAvailability={onRequestAvailability}
                      showBrokerDetails={showBrokerDetails}
                      operatorsMap={operatorsMap}
                    />
                  ))}
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        }

        return (
          <div key={category.section} className="space-y-3">
            <div>
              <h4 className="text-base font-semibold text-foreground">
                {config.label}
              </h4>
              {config.description && (
                <p className="text-xs text-muted-foreground mt-1">
                  {config.description}
                </p>
              )}
            </div>
            <div className="space-y-3">
              {category.results.map((result) => (
                <ActivityRow
                  key={result.id}
                  result={result}
                  section={category.section}
                  airportsMap={airportsMap}
                  isLoadingAirports={isLoadingAirports}
                  onRequestAvailability={onRequestAvailability}
                  showBrokerDetails={showBrokerDetails}
                  operatorsMap={operatorsMap}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface EmptyStateWithActivityProps {
  onShowActivity: () => void;
  showActivity: boolean;
  isLoading: boolean;
  isError: boolean;
  hasActivityData: boolean;
  onRetry: () => void;
  data: CategorizedRouteActivity[];
  airportsMap: Record<string, Airport>;
  isLoadingAirports: boolean;
  onWatchRoute?: () => void;
  onRequestAvailability?: (resultId: string, matchSection?: "exact" | "nearby" | "wider") => void;
  /** True when the panel was auto-expanded because other-date matches exist. */
  autoExpanded?: boolean;
  /** Broker-only: render operator + price under each row */
  showBrokerDetails?: boolean;
  operatorsMap?: Record<string, string>;
}

/**
 * Enhanced empty state component with route activity fallback
 *
 * States:
 * 1. Loading: "Checking activity…"
 * 2. Success + other-date matches: auto-expanded inline with "Matches available on alternate dates"
 * 3. Success + only historical activity: "View recent activity on this route" CTA (collapsed by default)
 * 4. Success + no data: true empty state
 * 5. Error: "Couldn't check recent activity right now." with retry
 */
export function EmptyStateWithActivity({
  onShowActivity,
  showActivity,
  isLoading,
  isError,
  hasActivityData,
  onRetry,
  data,
  airportsMap,
  isLoadingAirports,
  onWatchRoute,
  onRequestAvailability,
  autoExpanded = false,
  showBrokerDetails = false,
  operatorsMap,
}: EmptyStateWithActivityProps) {
  const hasOtherDateMatches = data.some((d) => d.section === "other_dates" || d.section === "other_dates_exact" || d.section === "other_dates_similar");

  // When auto-expanded for alternate-date matches, swap the headline and drop the
  // "check back daily" sub-text — the list itself is the answer.
  const isAlternateDatesView = autoExpanded && showActivity && hasOtherDateMatches;

  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 p-8">
      <div className="text-center space-y-4">
        {/* Primary message */}
        <h3 className="text-lg font-medium text-foreground">
          {isAlternateDatesView
            ? "Matches available on alternate dates"
            : hasOtherDateMatches && !isLoading && !isError
            ? "Matches are available on other dates"
            : "There are currently no matching empty legs for your requested route."}
        </h3>

        {/* Secondary text — suppressed in the auto-expanded alternate-dates view */}
        {!isAlternateDatesView && (
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Please check back as availability is updated daily.
          </p>
        )}

        {/* CTA buttons row */}
        {onWatchRoute && !showActivity && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-1 mt-4 max-w-md mx-auto">
            <Button onClick={onWatchRoute} className="text-sm font-semibold w-full sm:flex-1 sm:min-w-0 px-4">
              Ask us to watch this route
            </Button>

            {isLoading ? (
              <Button variant="outline" disabled className="text-sm font-semibold w-full sm:flex-1 sm:min-w-0 px-4">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Checking activity…
              </Button>
            ) : (
              !isError && hasActivityData && (
                <Button
                  variant={hasOtherDateMatches ? "default" : "outline"}
                  onClick={onShowActivity}
                  className="text-sm font-semibold w-full sm:flex-1 sm:min-w-0 px-4 shadow-md"
                >
                  {hasOtherDateMatches ? "See all matches" : "View recent activity on this route"}
                </Button>
              )
            )}
          </div>
        )}

        {/* Auto-expanded view: keep "Ask us to watch this route" available, hide redundant "See all matches" */}
        {onWatchRoute && isAlternateDatesView && (
          <div className="flex items-center justify-center mt-4 max-w-md mx-auto">
            <Button onClick={onWatchRoute} variant="outline" className="text-sm font-semibold px-4">
              Ask us to watch this route
            </Button>
          </div>
        )}

        {/* State 3: Success + no data - no extra message needed */}

        {/* State 4: Error - honest acknowledgment without false claims */}
        {!showActivity && isError && (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-muted-foreground">
              Couldn't check recent activity right now.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRetry()}
              disabled={isLoading}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              aria-label="Retry checking recent activity"
            >
              {isLoading ? "Checking…" : "Try again"}
            </Button>
          </div>
        )}
      </div>

      {/* Route Activity View - shown inline below empty state */}
      {showActivity && (
        <RouteActivityView
          isLoading={false}
          error={null}
          data={data}
          airportsMap={airportsMap}
          isLoadingAirports={isLoadingAirports}
          prioritizeOtherDates={hasOtherDateMatches}
          onRequestAvailability={onRequestAvailability}
          showBrokerDetails={showBrokerDetails}
          operatorsMap={operatorsMap}
        />
      )}
    </div>
  );
}
