import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Plane } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePublicSearchAirports } from "@/hooks/useClientSearch";
import { useDebounce } from "@/hooks/use-debounce";
import type { Airport } from "@/integrations/external-supabase/types";

export interface AirportSelection {
  icao: string;
  label: string;
}

interface AirportComboboxProps {
  value: AirportSelection | null;
  onChange: (selection: AirportSelection | null) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Format airport for display: City, State (US/CA) or City, Country — Name (ICAO)
 */
export function formatAirportDisplay(airport: Airport): string {
  const location = airport.city || airport.name;
  let region = "";
  
  // US and CA use state, others use country
  if ((airport.country === "US" || airport.country === "CA") && airport.state) {
    region = airport.state;
  } else {
    region = airport.country;
  }
  
  return `${location}, ${region} — ${airport.name} (${airport.icao})`;
}

/**
 * Truncate airport name if longer than maxLen, adding ellipsis
 */
function truncateName(name: string, maxLen = 28): string {
  if (name.length <= maxLen) return name;
  return name.slice(0, maxLen - 1).trimEnd() + "…";
}

/**
 * Format airport for result display: City, State/Country — Name (ICAO)
 * Includes truncated airport name to disambiguate (e.g., CYYZ vs CYTZ)
 */
export function formatAirportShort(airport: Airport): string {
  const location = airport.city || airport.name;
  let region = "";
  
  if ((airport.country === "US" || airport.country === "CA") && airport.state) {
    region = airport.state;
  } else {
    region = airport.country;
  }
  
  const shortName = truncateName(airport.name);
  return `${location}, ${region} — ${shortName} (${airport.icao})`;
}

export function AirportCombobox({
  value,
  onChange,
  placeholder = "Select airport...",
  className,
}: AirportComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 200);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { data: airports, isLoading } = usePublicSearchAirports(debouncedSearch, 20);

  // RPC already handles filtering/sorting, just use results directly
  const filteredAirports = (airports || []).filter(a => a.icao);

  const handleSelect = (airport: Airport) => {
    onChange({
      icao: airport.icao,
      label: formatAirportDisplay(airport),
    });
    setOpen(false);
    setSearch("");
  };

  const handleClear = () => {
    onChange(null);
    setSearch("");
  };

  useEffect(() => {
    if (open) {
      // Let the popover render, then focus the input.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between", className)}
        >
          {value ? (
            <span className="flex items-center gap-2 min-w-0">
              <Plane className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{value.label}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] sm:w-[440px] sm:min-w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0"
        align="start"
      >
        <div className="p-2">
          <Input
            ref={inputRef}
            placeholder="Search airports by city, code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search airports"
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto">
          <div className="p-1">
            {value && (
              <button
                type="button"
                onClick={handleClear}
                className="w-full rounded-sm px-2 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                Clear selection
              </button>
            )}

            {debouncedSearch.trim().length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground">
                Start typing a city or airport code…
              </div>
            ) : (
              <>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Airports
                </div>

                {isLoading && (
                  <div className="px-2 py-3 text-sm text-muted-foreground">Searching...</div>
                )}

                {!isLoading && filteredAirports.length === 0 && (
                  <div className="px-2 py-3 text-sm text-muted-foreground">No airports found.</div>
                )}

                {!isLoading &&
                  filteredAirports.map((airport) => {
                    const selected = value?.icao === airport.icao;
                    return (
                      <button
                        key={airport.icao}
                        type="button"
                        onClick={() => handleSelect(airport)}
                        className={cn(
                          "flex w-full items-center rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                          selected && "bg-accent text-accent-foreground"
                        )}
                      >
                        <Plane className="mr-2 h-4 w-4 text-muted-foreground" />
                        <span className="font-mono font-medium">{airport.icao}</span>
                        {airport.iata && (
                          <span className="ml-1 text-muted-foreground">({airport.iata})</span>
                        )}
                        <span className="ml-2 flex-1 truncate text-muted-foreground">
                          {formatAirportShort(airport)}
                        </span>
                        {selected && <Check className="ml-auto h-4 w-4" />}
                      </button>
                    );
                  })}
              </>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
