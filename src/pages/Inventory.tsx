import { useState, useMemo, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable } from "@/components/dashboard/DataTable";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { StatusIndicator } from "@/components/dashboard/StatusIndicator";
import { useEmptyLegs, useOperators, getAircraftDisplayName, getCategoryDisplayName, type EmptyLegWithAircraftType } from "@/hooks/useExternalData";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Search, Lock, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

type SortDirection = 'asc' | 'desc' | null;
type SortableColumn = 'departure' | 'aircraft' | 'category' | 'price' | 'operator' | 'status' | 'first_seen_at' | 'last_seen_at';

interface SortConfig {
  column: SortableColumn;
  direction: SortDirection;
}

export default function Inventory() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [routeSearch, setRouteSearch] = useState("");
  const [selectedLeg, setSelectedLeg] = useState<EmptyLegWithAircraftType | null>(null);
  
  // Column filters
  const [aircraftFilter, setAircraftFilter] = useState("");
  const [operatorFilter, setOperatorFilter] = useState("");
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  
  // Sorting - default to departure ascending (closest dates first)
  const [sortConfig, setSortConfig] = useState<SortConfig>({ 
    column: 'departure', 
    direction: 'asc' 
  });

  // Debounced search values for server-side filtering
  const [debouncedRouteSearch, setDebouncedRouteSearch] = useState("");
  const [debouncedAircraftFilter, setDebouncedAircraftFilter] = useState("");
  const [debouncedOperatorFilter, setDebouncedOperatorFilter] = useState("");

  // Debounce search inputs
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedRouteSearch(routeSearch);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [routeSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAircraftFilter(aircraftFilter);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [aircraftFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedOperatorFilter(operatorFilter);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [operatorFilter]);

  // Reset to page 1 when filters change
  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setCurrentPage(1);
  };

  const { data: paginatedData, isLoading, error } = useEmptyLegs({ 
    status: statusFilter, 
    routeSearch: debouncedRouteSearch,
    aircraftSearch: debouncedAircraftFilter,
    operatorSearch: debouncedOperatorFilter,
    page: currentPage, 
    pageSize 
  });
  const { data: operators } = useOperators();
  
  const legs = paginatedData?.data;
  const totalCount = paginatedData?.totalCount ?? 0;
  const totalPages = paginatedData?.totalPages ?? 1;

  // Create operator lookup map
  const operatorMap = new Map((operators || []).map(op => [op.id, op.name]));

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    // For date-only strings (YYYY-MM-DD), parse as local date to avoid timezone shift
    // When JS parses "2026-02-03" it treats it as midnight UTC, which shifts to previous day in US timezones
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [year, month, day] = dateString.split('-').map(Number);
      const localDate = new Date(year, month - 1, day);
      return localDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getOperatorName = (operatorId: string) => {
    return operatorMap.get(operatorId) || operatorId;
  };

  const getFromDisplay = (leg: EmptyLegWithAircraftType) => {
    return leg.departure_location_type === 'airport' 
      ? leg.departure_airport_icao 
      : leg.departure_corridor;
  };

  const getToDisplay = (leg: EmptyLegWithAircraftType) => {
    return leg.arrival_location_type === 'airport' 
      ? leg.arrival_airport_icao 
      : leg.arrival_corridor;
  };

  const getDepartureDisplay = (leg: EmptyLegWithAircraftType) => {
    const startDate = formatDate(leg.departure_date_start);
    if (leg.departure_date_start === leg.departure_date_end) {
      return leg.departure_time_local 
        ? `${startDate} ${leg.departure_time_local}`
        : startDate;
    }
    const endDate = formatDate(leg.departure_date_end);
    return `${startDate} – ${endDate}`;
  };

  const getOperatorDisplay = (leg: EmptyLegWithAircraftType) => {
    return leg.operator_name_raw || getOperatorName(leg.operator_id);
  };

  const getPriceDisplay = (leg: EmptyLegWithAircraftType) => {
    if (!leg.price) return "—";
    const formatted = leg.price.toLocaleString();
    return leg.price_currency ? `${formatted} ${leg.price_currency}` : formatted;
  };

  // Sort data (filtering is now done server-side)
  const processedLegs = useMemo(() => {
    let result = [...(legs || [])];

    // Apply sorting (client-side for current page)
    if (sortConfig.direction) {
      result.sort((a, b) => {
        let comparison = 0;
        
        switch (sortConfig.column) {
          case 'departure': {
            const dateA = a.departure_date_start ? new Date(a.departure_date_start).getTime() : 0;
            const dateB = b.departure_date_start ? new Date(b.departure_date_start).getTime() : 0;
            comparison = dateA - dateB;
            break;
          }
          case 'aircraft': {
            const aircraftA = getAircraftDisplayName(a).toLowerCase();
            const aircraftB = getAircraftDisplayName(b).toLowerCase();
            comparison = aircraftA.localeCompare(aircraftB);
            break;
          }
          case 'category': {
            const catA = getCategoryDisplayName(a).toLowerCase();
            const catB = getCategoryDisplayName(b).toLowerCase();
            comparison = catA.localeCompare(catB);
            break;
          }
          case 'price': {
            const priceA = a.price ?? 0;
            const priceB = b.price ?? 0;
            comparison = priceA - priceB;
            break;
          }
          case 'operator': {
            const opA = getOperatorDisplay(a).toLowerCase();
            const opB = getOperatorDisplay(b).toLowerCase();
            comparison = opA.localeCompare(opB);
            break;
          }
          case 'status': {
            comparison = a.status.localeCompare(b.status);
            break;
          }
          case 'first_seen_at': {
            const firstA = a.first_seen_at ? new Date(a.first_seen_at).getTime() : 0;
            const firstB = b.first_seen_at ? new Date(b.first_seen_at).getTime() : 0;
            comparison = firstA - firstB;
            break;
          }
          case 'last_seen_at': {
            const seenA = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
            const seenB = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
            comparison = seenA - seenB;
            break;
          }
        }
        
        return sortConfig.direction === 'desc' ? -comparison : comparison;
      });
    }

    return result;
  }, [legs, sortConfig]);

  const handleSort = (column: SortableColumn) => {
    setSortConfig(prev => {
      if (prev.column !== column) {
        return { column, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { column, direction: 'desc' };
      }
      if (prev.direction === 'desc') {
        return { column, direction: null };
      }
      return { column, direction: 'asc' };
    });
  };

  const getSortIcon = (column: SortableColumn) => {
    if (sortConfig.column !== column || !sortConfig.direction) {
      return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="h-3 w-3" /> 
      : <ArrowDown className="h-3 w-3" />;
  };

  const SortableHeader = ({ column, label }: { column: SortableColumn; label: string }) => (
    <button
      onClick={() => handleSort(column)}
      className="flex items-center gap-1 hover:text-foreground transition-colors"
    >
      {label}
      {getSortIcon(column)}
    </button>
  );

  const columns = [
    {
      key: "from",
      header: "From",
      render: (leg: EmptyLegWithAircraftType) => (
        <span className="font-mono">{getFromDisplay(leg) || '—'}</span>
      ),
    },
    {
      key: "to",
      header: "To",
      render: (leg: EmptyLegWithAircraftType) => (
        <span className="font-mono">{getToDisplay(leg) || '—'}</span>
      ),
    },
    {
      key: "departure",
      header: <SortableHeader column="departure" label="Departure" />,
      render: (leg: EmptyLegWithAircraftType) => (
        <span className="tabular-nums">{getDepartureDisplay(leg)}</span>
      ),
    },
    {
      key: "aircraft",
      header: <SortableHeader column="aircraft" label="Aircraft" />,
      render: (leg: EmptyLegWithAircraftType) => (
        <span className="text-muted-foreground">{getAircraftDisplayName(leg)}</span>
      ),
    },
    {
      key: "category",
      header: <SortableHeader column="category" label="Category" />,
      render: (leg: EmptyLegWithAircraftType) => (
        <span className="text-muted-foreground">{getCategoryDisplayName(leg)}</span>
      ),
    },
    {
      key: "price",
      header: <SortableHeader column="price" label="Price" />,
      render: (leg: EmptyLegWithAircraftType) => (
        <span className="text-muted-foreground tabular-nums">{getPriceDisplay(leg)}</span>
      ),
    },
    {
      key: "operator",
      header: <SortableHeader column="operator" label="Operator" />,
      render: (leg: EmptyLegWithAircraftType) => (
        <span className="text-muted-foreground">{getOperatorDisplay(leg)}</span>
      ),
    },
    {
      key: "status",
      header: <SortableHeader column="status" label="Status" />,
      render: (leg: EmptyLegWithAircraftType) => (
        <StatusIndicator
          status={leg.status === "active" ? "active" : "inactive"}
          label={leg.status}
        />
      ),
    },
    {
      key: "first_seen_at",
      header: <SortableHeader column="first_seen_at" label="First Seen" />,
      render: (leg: EmptyLegWithAircraftType) => (
        <span className="text-muted-foreground tabular-nums">
          {formatDateTime(leg.first_seen_at)}
        </span>
      ),
    },
    {
      key: "last_seen_at",
      header: <SortableHeader column="last_seen_at" label="Last Seen" />,
      render: (leg: EmptyLegWithAircraftType) => (
        <span className="text-muted-foreground tabular-nums">
          {formatDateTime(leg.last_seen_at)}
        </span>
      ),
    },
  ];

  if (error) {
    return (
      <DashboardLayout>
        <PageHeader title="Inventory" description="Error loading inventory" />
        <div className="bg-destructive/10 border border-destructive rounded-md p-4">
          <p className="text-destructive">Failed to load inventory: {error.message}</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Inventory"
        description="Read-only view of ingested empty legs"
        badge={
          <Badge variant="outline" className="bg-badge-muted border-border flex items-center gap-1">
            <Lock className="h-3 w-3" />
            Read Only
          </Badge>
        }
      />

      <FilterBar>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search route..."
            value={routeSearch}
            onChange={(e) => setRouteSearch(e.target.value)}
            className="pl-9 w-[160px] bg-secondary border-border"
          />
        </div>

        <Input
          placeholder="Aircraft..."
          value={aircraftFilter}
          onChange={(e) => setAircraftFilter(e.target.value)}
          className="w-[140px] bg-secondary border-border"
        />

        <Input
          placeholder="Operator..."
          value={operatorFilter}
          onChange={(e) => setOperatorFilter(e.target.value)}
          className="w-[140px] bg-secondary border-border"
        />

        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[140px] bg-secondary border-border">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="sold">Sold</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-sm text-muted-foreground ml-auto">
          {totalCount.toLocaleString()} legs
        </span>
      </FilterBar>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <DataTable<EmptyLegWithAircraftType>
          columns={columns}
          data={processedLegs}
          keyExtractor={(leg) => leg.id}
          onRowClick={(leg) => setSelectedLeg(leg)}
          emptyMessage="No inventory found"
        />
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-sm border border-border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-secondary transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm border border-border rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-secondary transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
      <Sheet open={!!selectedLeg} onOpenChange={() => setSelectedLeg(null)}>
        <SheetContent className="w-[500px] bg-card border-border overflow-y-auto">
          {selectedLeg && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <span className="font-mono">{getFromDisplay(selectedLeg) || '?'} → {getToDisplay(selectedLeg) || '?'}</span>
                  <Badge variant="outline" className="bg-badge-muted border-border flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    Read Only
                  </Badge>
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div className="bg-secondary rounded-md p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">From</span>
                    <span className="font-mono">{getFromDisplay(selectedLeg) || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">To</span>
                    <span className="font-mono">{getToDisplay(selectedLeg) || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Departure</span>
                    <span>{getDepartureDisplay(selectedLeg)}</span>
                  </div>
                  {selectedLeg.time_window && (
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Time Window</span>
                      <span>{selectedLeg.time_window}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Aircraft</span>
                    <span>{getAircraftDisplayName(selectedLeg)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Category</span>
                    <span>{getCategoryDisplayName(selectedLeg)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Operator</span>
                    <span>{selectedLeg.operator_name_raw || getOperatorName(selectedLeg.operator_id)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <StatusIndicator
                      status={selectedLeg.status === "active" ? "active" : "inactive"}
                      label={selectedLeg.status}
                    />
                  </div>
                  {selectedLeg.price && (
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Price</span>
                      <span>
                        {selectedLeg.price.toLocaleString()} {selectedLeg.price_currency || 'USD'}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">First Seen</span>
                    <span>{formatDateTime(selectedLeg.first_seen_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Last Seen</span>
                    <span>{formatDateTime(selectedLeg.last_seen_at)}</span>
                  </div>
                  {selectedLeg.confidence_score !== null && (
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Confidence</span>
                      <span>{(selectedLeg.confidence_score * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </div>

                <div className="bg-muted/30 rounded-md p-4 border border-border">
                  <p className="text-xs text-muted-foreground">
                    Inventory is read-only. Edits are not permitted. To correct data, 
                    review the source email and operator configuration.
                  </p>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}
