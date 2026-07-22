import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, MapPin, Plane } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAdminSearchAirports } from "@/hooks/useClientSearch";
import { formatAirportDisplay, formatAirportShort } from "@/components/search/AirportCombobox";
import { useCorridorSummaries } from "@/hooks/useCorridors";
import { useDebounce } from "@/hooks/use-debounce";

export type LocationType = "corridor" | "airport";

export interface LocationSelection {
  type: LocationType;
  value: string;
  label: string;
}

interface LocationComboboxProps {
  value: LocationSelection | null;
  onChange: (selection: LocationSelection | null) => void;
  placeholder?: string;
  className?: string;
}

export function LocationCombobox({
  value,
  onChange,
  placeholder = "Select location...",
  className,
}: LocationComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 200);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { data: corridors } = useCorridorSummaries();
  const { data: airports, isLoading: airportsLoading } = useAdminSearchAirports(debouncedSearch, 15, false);

  // Filter corridors by search - only show user_selectable expansion corridors
  const filteredCorridors = useMemo(() => {
    if (!corridors) return [];
    const selectableCorridors = corridors.filter(c => c.user_selectable && c.active);
    if (!search) return selectableCorridors.slice(0, 10);
    return selectableCorridors
      .filter((c) => c.id.toLowerCase().includes(search.toLowerCase()) || c.display_name.toLowerCase().includes(search.toLowerCase()))
      .slice(0, 10);
  }, [corridors, search]);

  // RPC already handles filtering/sorting
  const filteredAirports = (airports || []).filter(a => a.icao);

  const handleSelect = (type: LocationType, value: string, label: string) => {
    onChange({ type, value, label });
    setOpen(false);
    setSearch("");
  };

  const handleClear = () => {
    onChange(null);
    setSearch("");
  };

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between bg-secondary border-border", className)}
        >
          {value ? (
            <span className="flex items-center gap-2 truncate">
              {value.type === "corridor" ? (
                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <Plane className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <span className="truncate">{value.label}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <div className="p-2">
          <Input
            ref={inputRef}
            placeholder="Search corridors or airports..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search locations"
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

            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Corridors
            </div>
            {filteredCorridors.length === 0 && (
              <div className="px-2 py-3 text-sm text-muted-foreground">No corridors found.</div>
            )}
            {filteredCorridors.map((corridor) => {
              const selected = value?.type === "corridor" && value.value === corridor.id;
              return (
                <button
                  key={`corridor-${corridor.id}`}
                  type="button"
                  onClick={() => handleSelect("corridor", corridor.id, corridor.display_name)}
                  className={cn(
                    "flex w-full items-center rounded-sm px-2 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
                    selected && "bg-accent text-accent-foreground"
                  )}
                >
                  <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{corridor.display_name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({corridor.airport_count} airports)
                  </span>
                  {selected && <Check className="ml-auto h-4 w-4" />}
                </button>
              );
            })}

            <div className="mt-2 px-2 py-1.5 text-xs font-medium text-muted-foreground">
              Airports
            </div>
            {airportsLoading && (
              <div className="px-2 py-3 text-sm text-muted-foreground">Searching...</div>
            )}
            {!airportsLoading && filteredAirports.length === 0 && (
              <div className="px-2 py-3 text-sm text-muted-foreground">No airports found.</div>
            )}
            {!airportsLoading &&
              filteredAirports.map((airport) => {
                const selected = value?.type === "airport" && value.value === airport.icao;
                const displayLabel = formatAirportDisplay(airport);
                return (
                  <button
                    key={`airport-${airport.icao}`}
                    type="button"
                    onClick={() =>
                      handleSelect("airport", airport.icao, displayLabel)
                    }
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
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
