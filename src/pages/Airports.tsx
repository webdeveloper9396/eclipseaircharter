import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { useAdminSearchAirports } from "@/hooks/useClientSearch";
import type { Airport } from "@/integrations/external-supabase/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus, AlertCircle } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { AirportEditPanel } from "@/components/airports/AirportEditPanel";
import { AirportListItem } from "@/components/airports/AirportListItem";

export default function Airports() {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [showExcluded, setShowExcluded] = useState(false);
  const [limit, setLimit] = useState<number>(50);

  // Selection state
  const [selectedIcao, setSelectedIcao] = useState<string | null>(null);
  const [isCreateMode, setIsCreateMode] = useState(false);

  const {
    data: airports,
    isLoading,
    error,
  } = useAdminSearchAirports(debouncedSearch, limit, showExcluded);

  // Find the selected airport from the data
  const selectedAirport = useMemo(() => {
    if (!selectedIcao || !airports) return null;
    return airports.find((a) => a.icao === selectedIcao) || null;
  }, [airports, selectedIcao]);

  const handleSelectAirport = (airport: Airport) => {
    setSelectedIcao(airport.icao);
    setIsCreateMode(false);
  };

  const handleAddAirport = () => {
    setSelectedIcao(null);
    setIsCreateMode(true);
  };

  const handleCancel = () => {
    setSelectedIcao(null);
    setIsCreateMode(false);
  };

  const handleSaved = (icao: string) => {
    setSelectedIcao(icao);
    setIsCreateMode(false);
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Airports"
        description="Manage airport data, rankings, and search settings"
      />

      <div className="flex gap-6 h-[calc(100vh-180px)]">
        {/* Left Panel: Search + List */}
        <div className="w-1/2 flex flex-col border border-border rounded-lg bg-card overflow-hidden">
          {/* Controls */}
          <div className="p-4 border-b border-border space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by ICAO, IATA, city, name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-secondary border-border"
              />
            </div>

            {/* Filters row */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="show-excluded"
                  checked={showExcluded}
                  onCheckedChange={setShowExcluded}
                />
                <Label htmlFor="show-excluded" className="text-sm">
                  Show excluded
                </Label>
              </div>

              <Select
                value={limit.toString()}
                onValueChange={(v) => setLimit(parseInt(v, 10))}
              >
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>

              <Button size="sm" onClick={handleAddAirport} className="ml-auto">
                <Plus className="h-4 w-4 mr-1" />
                Add Airport
              </Button>
            </div>
          </div>

          {/* Results */}
          {error ? (
            <div className="p-4 flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">
                Failed to load airports: {error.message}
              </span>
            </div>
          ) : isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : !airports || airports.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p>No airports found</p>
              {searchQuery && (
                <p className="text-xs mt-1">Try a different search term</p>
              )}
            </div>
          ) : (
            <ScrollArea className="flex-1">
              <div>
                {airports.map((airport) => (
                  <AirportListItem
                    key={airport.icao || airport.id}
                    airport={airport}
                    isSelected={selectedIcao === airport.icao}
                    onClick={() => handleSelectAirport(airport)}
                  />
                ))}
              </div>
            </ScrollArea>
          )}

          {/* Footer with count */}
          {airports && airports.length > 0 && (
            <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground">
              {airports.length} airport{airports.length !== 1 ? "s" : ""} shown
              {limit && airports.length >= limit && " (limit reached)"}
            </div>
          )}
        </div>

        {/* Right Panel: Edit/Create Form */}
        <div className="w-1/2 border border-border rounded-lg bg-card overflow-hidden">
          <AirportEditPanel
            airport={selectedAirport}
            isCreateMode={isCreateMode}
            onSaved={handleSaved}
            onCancel={handleCancel}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
