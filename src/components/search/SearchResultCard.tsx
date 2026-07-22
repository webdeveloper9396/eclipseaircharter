import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Plane, Clock, Calendar } from "lucide-react";
import type { ClientSearchResult, AircraftType, MatchSection } from "@/hooks/useClientSearch";
import type { Airport } from "@/integrations/external-supabase/types";
import { formatAirportShort } from "./AirportCombobox";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

import { getCategorySeatRange } from "@/lib/aircraft-utils";

const EXTERNAL_STORAGE_BASE =
  "https://zhjkexhurxafsurnsetw.supabase.co/storage/v1/object/public/aircraft-type-images/";

function getImageUrl(path: string | null): string | null {
  if (!path) return null;
  return EXTERNAL_STORAGE_BASE + path;
}

interface SearchResultCardProps {
  result: ClientSearchResult;
  airportsMap: Record<string, Airport>;
  isLoadingAirports: boolean;
  aircraftTypesMap?: Record<string, AircraftType>;
  onRequestAvailability?: (resultId: string) => void;
  matchSection?: MatchSection;
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

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasToggle) setActiveSlot((s) => (s === "exterior" ? "interior" : "exterior"));
  };

  const showExt = extUrl && !exteriorErrored;
  const showInt = intUrl && !interiorErrored;
  const showPlaceholder = !showExt && activeSlot === "exterior" || !showInt && activeSlot === "interior";

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
      {/* Placeholder when no image available for active slot */}
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

export function SearchResultCard({
  result,
  airportsMap,
  isLoadingAirports,
  aircraftTypesMap = {},
  onRequestAvailability,
  matchSection,
}: SearchResultCardProps) {
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
  const isNonDirect = matchSection === "nearby" || matchSection === "wider";
  const buttonLabel = isNonDirect ? "Review for My Route" : "Request Details";

  const handleCardClick = () => {
    if (onRequestAvailability) onRequestAvailability(result.id);
  };

  return (
    <div
      className={`rounded-lg border border-border bg-card p-3 transition-colors ${onRequestAvailability ? "cursor-pointer hover:border-primary/30 hover:bg-accent/30 active:bg-accent/50" : ""}`}
      onClick={handleCardClick}
    >
      {/* Desktop: thumbnail left + content right */}
      <div className="hidden sm:flex gap-3 items-center">
        {/* Thumbnail: 16:9 at 160px wide = 90px tall */}
        <AircraftThumbnail
          path={result.exterior_image_path}
          interiorPath={result.interior_image_path}
          className="w-[160px] h-[90px] shrink-0"
        />

        {/* Content */}
        <div className="flex flex-col gap-2 flex-1 min-w-0">
          {/* Row 1 — Route + badge */}
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


          {/* Row 3 — Meta + action */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{formatRecency(result.last_seen_at)}</span>
            </div>
            {onRequestAvailability && (
                <Button
                size="sm"
                className="text-xs shrink-0 border-none"
                style={{ backgroundColor: "#b7a369", color: "#fff" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#a08f55")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#b7a369")}
                onClick={(e) => { e.stopPropagation(); onRequestAvailability(result.id); }}
              >
                {buttonLabel}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile layout */}
      <div className="sm:hidden flex flex-col gap-2.5">
        {/* Thumbnail row above content on mobile */}
        <AircraftThumbnail
          path={result.exterior_image_path}
          interiorPath={result.interior_image_path}
          className="w-full aspect-video"
        />

        {/* Row 1 — Route + badge */}
        <div className="flex items-center flex-wrap gap-2 text-sm">
          <Plane className="h-3.5 w-3.5 text-foreground/40 shrink-0" />
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


        {/* Row 3 — Meta + action */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{formatRecency(result.last_seen_at)}</span>
          </div>
          {onRequestAvailability && (
            <Button
              size="sm"
              className="text-xs shrink-0 border-none"
              style={{ backgroundColor: "#b7a369", color: "#fff" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#a08f55")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#b7a369")}
              onClick={(e) => { e.stopPropagation(); onRequestAvailability(result.id); }}
            >
              {buttonLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SearchResultSkeleton() {
  return (
    <div className="rounded-lg border border-border/30 bg-card/80 p-3">
      <div className="hidden sm:flex gap-3">
        {/* Thumbnail skeleton */}
        <Skeleton className="w-[160px] h-[90px] rounded shrink-0" />
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
          </div>
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="sm:hidden flex flex-col gap-2.5">
        <Skeleton className="w-full h-10 rounded" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}
