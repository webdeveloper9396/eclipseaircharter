import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable } from "@/components/dashboard/DataTable";
import { SeverityBadge } from "@/components/dashboard/SeverityBadge";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { useSystemEvents } from "@/hooks/useExternalData";
import type { SystemEvent } from "@/integrations/external-supabase/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Lock } from "lucide-react";

export default function SystemEvents() {
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedEvent, setSelectedEvent] = useState<SystemEvent | null>(null);

  const { data: events, isLoading, error } = useSystemEvents(200);

  const eventTypes = [...new Set((events || []).map((e) => e.event_type))];

  const filteredEvents = (events || []).filter((event) => {
    if (severityFilter !== "all" && event.severity !== severityFilter) return false;
    if (typeFilter !== "all" && event.event_type !== typeFilter) return false;
    return true;
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const columns = [
    {
      key: "observed_at",
      header: "Timestamp",
      render: (event: SystemEvent) => (
        <span className="font-mono text-xs tabular-nums">
          {formatDate(event.observed_at)}
        </span>
      ),
      className: "w-44",
    },
    {
      key: "severity",
      header: "Severity",
      render: (event: SystemEvent) => <SeverityBadge severity={event.severity} />,
      className: "w-24",
    },
    {
      key: "event_type",
      header: "Event Type",
      render: (event: SystemEvent) => (
        <span className="font-mono text-sm">{event.event_type}</span>
      ),
    },
    {
      key: "operator_name",
      header: "Operator",
      render: (event: SystemEvent) => (
        <span className="text-muted-foreground">{event.operator_name || "—"}</span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (event: SystemEvent) => (
        <span className="text-muted-foreground truncate block max-w-xs">
          {event.reason || "—"}
        </span>
      ),
    },
  ];

  if (error) {
    return (
      <DashboardLayout>
        <PageHeader title="System Events" description="Error loading events" />
        <div className="bg-destructive/10 border border-destructive rounded-md p-4">
          <p className="text-destructive">Failed to load events: {error.message}</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="System Events"
        description="Audit log and system activity. All events are read-only."
        badge={
          <Badge variant="outline" className="bg-badge-muted border-border flex items-center gap-1">
            <Lock className="h-3 w-3" />
            Audit Log
          </Badge>
        }
      />

      <FilterBar>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[140px] bg-secondary border-border">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="warn">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px] bg-secondary border-border">
            <SelectValue placeholder="Event Type" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">All Types</SelectItem>
            {eventTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <DataTable<SystemEvent>
          columns={columns}
          data={filteredEvents}
          keyExtractor={(event) => event.id}
          onRowClick={(event) => setSelectedEvent(event)}
          emptyMessage="No events found"
        />
      )}

      {/* Event Detail Sheet */}
      <Sheet open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <SheetContent className="w-[500px] bg-card border-border overflow-y-auto">
          {selectedEvent && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <SeverityBadge severity={selectedEvent.severity} />
                  <span className="font-mono text-sm">{selectedEvent.event_type}</span>
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div className="bg-secondary rounded-md p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Timestamp</span>
                    <span className="font-mono text-sm">{formatDate(selectedEvent.observed_at)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Event ID</span>
                    <span className="font-mono text-sm text-muted-foreground truncate max-w-[200px]">{selectedEvent.id}</span>
                  </div>
                  {selectedEvent.operator_name && (
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Operator</span>
                      <span>{selectedEvent.operator_name}</span>
                    </div>
                  )}
                  {selectedEvent.source_email_id && (
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Source Email</span>
                      <span className="font-mono text-sm truncate max-w-[200px]">{selectedEvent.source_email_id}</span>
                    </div>
                  )}
                </div>

                {selectedEvent.reason && (
                  <div>
                    <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                      Reason
                    </h4>
                    <p className="text-sm bg-secondary rounded-md p-4">{selectedEvent.reason}</p>
                  </div>
                )}

                <div>
                  <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    Full Payload
                  </h4>
                  <pre className="bg-secondary rounded-md p-4 text-xs font-mono overflow-x-auto text-muted-foreground">
                    {JSON.stringify(selectedEvent.payload, null, 2)}
                  </pre>
                </div>

                <div className="bg-muted/30 rounded-md p-4 border border-border">
                  <p className="text-xs text-muted-foreground">
                    System events are read-only. This log exists for audit and debugging purposes.
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
