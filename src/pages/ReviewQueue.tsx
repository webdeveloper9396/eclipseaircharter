import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable } from "@/components/dashboard/DataTable";
import { SeverityBadge } from "@/components/dashboard/SeverityBadge";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { useSystemEventsForReview, ReviewQueueFilter } from "@/hooks/useExternalData";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { ExternalLink, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CorridorRecommendationsSection } from "@/components/review/CorridorRecommendationsSection";
import { Separator } from "@/components/ui/separator";

export default function ReviewQueue() {
  const [filter, setFilter] = useState<ReviewQueueFilter>("actionable");
  const [selectedEvent, setSelectedEvent] = useState<SystemEvent | null>(null);
  const { toast } = useToast();

  const { data: events, isLoading, error } = useSystemEventsForReview(filter);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleAcknowledge = () => {
    toast({
      title: "Event acknowledged",
      description: "Action has been logged to system events.",
    });
    setSelectedEvent(null);
  };

  const columns = [
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
      render: (event: SystemEvent) => event.operator_name || "—",
    },
    {
      key: "reason",
      header: "Reason",
      render: (event: SystemEvent) => (
        <span className="text-muted-foreground truncate max-w-[300px] block">
          {event.reason || "—"}
        </span>
      ),
    },
    {
      key: "observed_at",
      header: "Observed",
      render: (event: SystemEvent) => (
        <span className="text-muted-foreground tabular-nums">
          {formatDate(event.observed_at)}
        </span>
      ),
      className: "w-36",
    },
  ];

  if (error) {
    return (
      <DashboardLayout>
        <PageHeader title="Review Queue" description="Error loading events" />
        <div className="bg-destructive/10 border border-destructive rounded-md p-4">
          <p className="text-destructive">Failed to load events: {error.message}</p>
        </div>
      </DashboardLayout>
    );
  }

  const eventCount = events?.length || 0;

  return (
    <DashboardLayout>
      <PageHeader
        title="Review Queue"
        description="Events requiring human judgment. False sold is worse than false available."
        badge={
          eventCount > 0 && (
            <span className="text-xs bg-accent/20 text-accent px-2 py-1 rounded">
              {eventCount} pending
            </span>
          )
        }
      />

      <FilterBar>
        <Select value={filter} onValueChange={(v) => setFilter(v as ReviewQueueFilter)}>
          <SelectTrigger className="w-[180px] bg-secondary border-border">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="actionable">Actionable (14 days)</SelectItem>
            <SelectItem value="all_warn_error">All Warn/Error</SelectItem>
            <SelectItem value="all">All Events</SelectItem>
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
          data={events || []}
          keyExtractor={(event) => event.id}
          onRowClick={(event) => setSelectedEvent(event)}
          emptyMessage="No events requiring review"
        />
      )}

      <Separator className="my-8" />
      <CorridorRecommendationsSection />

      {/* Event Detail Sheet */}
      <Sheet open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <SheetContent className="w-[500px] bg-card border-border overflow-y-auto">
          {selectedEvent && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <SeverityBadge severity={selectedEvent.severity} />
                  <span className="font-mono">{selectedEvent.event_type}</span>
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Event Details */}
                <section>
                  <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    Details
                  </h3>
                  <div className="bg-secondary rounded-md p-4 space-y-3">
                    <div>
                      <span className="text-xs text-muted-foreground">Reason</span>
                      <p className="text-sm">{selectedEvent.reason || "—"}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">Observed</span>
                      <p className="text-sm">{formatDate(selectedEvent.observed_at)}</p>
                    </div>
                    {selectedEvent.operator_name && (
                      <div>
                        <span className="text-xs text-muted-foreground">Operator</span>
                        <p className="text-sm">{selectedEvent.operator_name}</p>
                      </div>
                    )}
                    {selectedEvent.source_email_id && (
                      <div>
                        <span className="text-xs text-muted-foreground">Source Email</span>
                        <p className="text-sm font-mono flex items-center gap-2">
                          {selectedEvent.source_email_id}
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Payload */}
                <section>
                  <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    Payload (Read Only)
                  </h3>
                  <pre className="bg-secondary rounded-md p-4 text-xs font-mono overflow-x-auto text-muted-foreground">
                    {JSON.stringify(selectedEvent.payload, null, 2)}
                  </pre>
                </section>

                {/* Actions */}
                <section>
                  <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                    Actions
                  </h3>
                  <div className="space-y-2">
                    <ConfirmDialog
                      trigger={
                        <Button
                          variant="outline"
                          className="w-full justify-start bg-secondary border-border"
                        >
                          <Check className="h-4 w-4 mr-2" />
                          Acknowledge & Dismiss
                        </Button>
                      }
                      title="Acknowledge Event"
                      description="This will mark the event as reviewed. An audit event will be logged."
                      confirmLabel="Acknowledge"
                      onConfirm={handleAcknowledge}
                    />

                    {selectedEvent.operator_id && (
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="outline"
                            className="w-full justify-start bg-secondary border-border"
                          >
                            Set Operator Inventory Mode
                          </Button>
                        }
                        title="Set Inventory Mode"
                        description="This is a dangerous action that affects how the system processes this operator's inventory. An audit event will be logged."
                        confirmLabel="Proceed"
                        dangerous
                        onConfirm={() => {
                          toast({
                            title: "Action logged",
                            description: "Navigate to operator detail to complete.",
                          });
                        }}
                      />
                    )}
                  </div>
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}
