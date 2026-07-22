import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Plane, Clock, Calendar, Building2, DollarSign } from "lucide-react";
import type { ClientSearchResult, AircraftType } from "@/hooks/useClientSearch";
import type { Airport } from "@/integrations/external-supabase/types";
import { formatAirportShort } from "./AirportCombobox";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategorySeatRange } from "@/lib/aircraft-utils";

const EXTERNAL_STORAGE_BASE =
  "https://zhjkexhurxafsurnsetw.supabase.co/storage/v1/object/public/aircraft-type-images/";

function getImageUrl(path: string | null): string | null {
  if (!path) return null;
  return EXTERNAL_STORAGE_BASE + path;
}

interface BrokerSearchResultCardProps {
  result: ClientSearchResult;
  airportsMap: Record<string, Airport>;
  isLoadingAirports: boolean;
  aircraftTypesMap?: Record<string, AircraftType>;
  operatorsMap?: Record<string, string>; // operator_id → operator name
}

function formatRecency(lastSeenAt: string): string {
  const distance = formatDistanceToNow(new Date(lastSeenAt), { addSuffix: false });
  return `Seen ${distance} ago`;
}

function parseDateOnly(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateRange(start: string, end: string): string {
  const startDate = parseDateOnly(start);
  const endDate = parseDateOnly(end);
  const startFormatted = format(startDate, "EEE MMM d");
  const endFormatted = format(endDate, "EEE MMM d");
  if (startFormatted === endFormatted) return startFormatted;
  return `${startFormatted} – ${endFormatted}`;
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const date = dateStr.includes("T") ? new Date(dateStr) : parseDateOnly(dateStr);
    if (isNaN(date.getTime())) return "—";
    return format(date, "MMM d");
  } catch {
    return "—";
  }
}

function formatCategory(category: string | null): string {
  if (!category) return "";
  return category
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function titleCase(str: string): string {
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatLocationDisplay(
  icao: string | null,
  locationType: string,
  corridor: string | null,
  locationRaw: string | null,
  airportsMap: Record<string, Airport>,
  isLoading: boolean
): React.ReactNode {
  if (locationType === "airport" && icao) {
    if (isLoading) return <Skeleton className="h-4 w-32 inline-block" />;
    const airport = airportsMap[icao];
    if (airport) return <span>{formatAirportShort(airport)}</span>;
    return <span className="font-mono">{icao}</span>;
  }
  if (locationRaw) return <span>{locationRaw}</span>;
  if (corridor) return <span>{titleCase(corridor)}</span>;
  return <span className="text-muted-foreground">Unknown</span>;
}

function formatPrice(price: number | null, currency: string | null): string {
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

/** Thumbnail with graceful fallback to placeholder, and optional interior toggle */
function AircraftThumbnail({
  path,
  interiorPath,
  className,
}: {
  path: string | null;
  interiorPath?: string | null;
  className?: string;
}) {
  const [exteriorErrored, setExteriorErrored] = useState(false);
  const [interiorErrored, setInteriorErrored] = useState(false);
  const [activeSlot, setActiveSlot] = useState<"exterior" | "interior">("exterior");

  const extUrl = getImageUrl(path);
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
      {/* Exterior image */}
      {showExt && (
        <img
          src={extUrl}
          alt="Aircraft exterior"
          loading="lazy"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ease-in-out ${activeSlot === "exterior" ? "opacity-100" : "opacity-0"}`}
          onError={() => setExteriorErrored(true)}
        />
      )}
      {/* Interior image — preloaded in DOM for instant swap */}
      {showInt && (
        <img
          src={intUrl}
          alt="Aircraft interior"
          loading="lazy"
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ease-in-out ${activeSlot === "interior" ? "opacity-100" : "opacity-0"}`}
          onError={() => setInteriorErrored(true)}
        />
      )}
      {/* Placeholder when no image available */}
      {!showExt && !showInt && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Plane className="h-4 w-4 text-muted-foreground/25" />
        </div>
      )}
      {/* Dot indicators — only when both images exist */}
      {hasToggle && (
        <div className="absolute bottom-1 right-1 flex gap-1 pointer-events-none">
          <span
            className={`block h-1.5 w-1.5 rounded-full transition-colors duration-200 ${activeSlot === "exterior" ? "bg-white" : "bg-white/40"}`}
          />
          <span
            className={`block h-1.5 w-1.5 rounded-full transition-colors duration-200 ${activeSlot === "interior" ? "bg-white" : "bg-white/40"}`}
          />
        </div>
      )}
    </div>
  );
}

export function BrokerSearchResultCard({
  result,
  airportsMap,
  isLoadingAirports,
  aircraftTypesMap = {},
  operatorsMap = {},
}: BrokerSearchResultCardProps) {
  const resolvedAircraftModel = (() => {
    if (result.aircraft_type_id && aircraftTypesMap[result.aircraft_type_id]) {
      const type = aircraftTypesMap[result.aircraft_type_id];
      if (type.manufacturer && type.model) return `${type.manufacturer} ${type.model}`;
      if (type.model) return type.model;
    }
    return result.aircraft_model || "Aircraft TBD";
  })();

  const category = formatCategory(result.aircraft_category);
  const seatRange = getCategorySeatRange(result.aircraft_category);
  const operatorName = result.operator_id
    ? (operatorsMap[result.operator_id] ?? result.operator_id)
    : "—";
  const priceDisplay = formatPrice(result.price, result.price_currency);
  const firstSeenDisplay = result.first_seen_at ? formatShortDate(result.first_seen_at) : "—";
  const lastSeenDisplay = result.last_seen_at ? formatShortDate(result.last_seen_at) : "—";

  return (
    <div className="rounded-lg border border-border bg-card p-3 transition-colors">
      {/* Desktop layout */}
      <div className="hidden sm:flex gap-3 items-center">
        {/* Thumbnail: 16:9 at 160px wide = 90px tall */}
        <AircraftThumbnail
          path={result.exterior_image_path}
          interiorPath={result.interior_image_path}
          className="w-[160px] h-[90px] shrink-0"
        />

        {/* Content */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {/* Row 1 — Route */}
          <div className="flex items-center gap-2 text-sm">
            <Plane className="h-4 w-4 text-foreground/40 shrink-0" />
            <span className="font-semibold text-foreground">
              {formatLocationDisplay(
                result.departure_airport_icao,
                result.departure_location_type,
                result.departure_corridor,
                result.departure_location_raw,
                airportsMap,
                isLoadingAirports
              )}
            </span>
            <span className="text-foreground/40">→</span>
            <span className="font-semibold text-foreground">
              {formatLocationDisplay(
                result.arrival_airport_icao,
                result.arrival_location_type,
                result.arrival_corridor,
                result.arrival_location_raw,
                airportsMap,
                isLoadingAirports
              )}
            </span>
          </div>

          {/* Row 2 — Core details */}
          <div className="flex items-center gap-5 text-sm">
            <div className="flex items-center gap-1.5 text-foreground/70">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>{formatDateRange(result.departure_date_start, result.departure_date_end)}</span>
            </div>
            <span className="text-foreground/70">{resolvedAircraftModel}</span>
            <span className="text-muted-foreground">
              {category || "—"}
              {seatRange && <span className="text-xs ml-1">({seatRange})</span>}
            </span>
          </div>

          {/* Row 3 — Broker enriched data */}
          <div className="flex items-center gap-6 pt-1 border-t border-border/40 mt-0.5">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground min-w-0">
              <Building2 className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              <span className="font-medium text-foreground/80 truncate">{operatorName}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <DollarSign className="h-3 w-3 shrink-0 text-muted-foreground/60" />
              <span
                className={
                  priceDisplay === "Price on request"
                    ? "text-muted-foreground italic"
                    : "font-medium text-foreground/80"
                }
              >
                {priceDisplay}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
              <Clock className="h-3 w-3 shrink-0" />
              <span>First: {firstSeenDisplay}</span>
              <span className="text-foreground/20">·</span>
              <span>Last: {lastSeenDisplay}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile layout */}
      <div className="sm:hidden flex flex-col gap-2.5">
        {/* Thumbnail above content on mobile */}
        <AircraftThumbnail
          path={result.exterior_image_path}
          interiorPath={result.interior_image_path}
          className="w-full h-14"
        />

        {/* Row 1 — Route */}
        <div className="flex items-center gap-2 text-sm">
          <Plane className="h-3.5 w-3.5 text-foreground/40 shrink-0" />
          <span className="font-semibold text-foreground truncate">
            {formatLocationDisplay(
              result.departure_airport_icao,
              result.departure_location_type,
              result.departure_corridor,
              result.departure_location_raw,
              airportsMap,
              isLoadingAirports
            )}
          </span>
          <span className="text-foreground/40">→</span>
          <span className="font-semibold text-foreground truncate">
            {formatLocationDisplay(
              result.arrival_airport_icao,
              result.arrival_location_type,
              result.arrival_corridor,
              result.arrival_location_raw,
              airportsMap,
              isLoadingAirports
            )}
          </span>
        </div>

        {/* Row 2 — Core details */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <span>{formatDateRange(result.departure_date_start, result.departure_date_end)}</span>
          </div>
          <span className="text-foreground/70">{resolvedAircraftModel}</span>
          {category && (
            <span>
              {category}
              {seatRange && <span className="text-xs ml-1">({seatRange})</span>}
            </span>
          )}
        </div>

        {/* Row 3 — Broker enriched data */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 border-t border-border/40 mt-0.5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="font-medium text-foreground/80">{operatorName}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <DollarSign className="h-3 w-3 shrink-0" />
            <span
              className={
                priceDisplay === "Price on request"
                  ? "italic"
                  : "font-medium text-foreground/80"
              }
            >
              {priceDisplay}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" />
            <span>
              {firstSeenDisplay} – {lastSeenDisplay}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
