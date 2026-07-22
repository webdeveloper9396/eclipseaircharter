import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Airport } from "@/integrations/external-supabase/types";
import { EyeOff, Hash, MapPin, Plane } from "lucide-react";

interface AirportListItemProps {
  airport: Airport;
  isSelected: boolean;
  onClick: () => void;
}

/**
 * Format airport for display: City, State (US/CA) or City, Country — Name (ICAO)
 * Returns fallback if data is incomplete
 */
export function formatAirportLabel(airport: Airport): string {
  const city = airport.city;
  const name = airport.name;
  const icao = airport.icao;

  // Handle missing data
  if (!city && !name) {
    return `(${icao}) — Missing name/city`;
  }

  const location = city || name;
  let region = "";

  // US and CA use state, others use country
  if ((airport.country === "US" || airport.country === "CA") && airport.state) {
    region = airport.state;
  } else if (airport.country) {
    region = airport.country;
  }

  if (!name) {
    return region 
      ? `${location}, ${region} (${icao}) — Missing name`
      : `${location} (${icao}) — Missing name`;
  }

  return region
    ? `${location}, ${region} — ${name} (${icao})`
    : `${location} — ${name} (${icao})`;
}

export function AirportListItem({
  airport,
  isSelected,
  onClick,
}: AirportListItemProps) {
  const label = formatAirportLabel(airport);
  const hasIncompleteData = !airport.city || !airport.name;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-border transition-colors hover:bg-accent/50",
        isSelected && "bg-accent"
      )}
    >
      <div className="flex items-start gap-3">
        <Plane className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-sm font-medium truncate",
              hasIncompleteData && "text-warning"
            )}
          >
            {label}
          </p>

          {/* Tags row */}
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {airport.admin_exclude_from_search && (
              <Badge
                variant="outline"
                className="text-xs bg-destructive/10 text-destructive border-destructive/30"
              >
                <EyeOff className="h-3 w-3 mr-1" />
                Excluded
              </Badge>
            )}

            {airport.admin_rank != null && (
              <Badge variant="secondary" className="text-xs">
                <Hash className="h-3 w-3 mr-0.5" />
                Rank: {airport.admin_rank}
              </Badge>
            )}

            {airport.search_city_override && (
              <Badge variant="outline" className="text-xs">
                <MapPin className="h-3 w-3 mr-1" />
                Metro: {airport.search_city_override}
              </Badge>
            )}

            {airport.iata && (
              <Badge variant="outline" className="text-xs font-mono">
                IATA: {airport.iata}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
