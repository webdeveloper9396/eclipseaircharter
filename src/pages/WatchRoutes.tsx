import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useWatchRoutes, useCreateWatchRoute, useSetWatchRouteStatus } from "@/hooks/useWatchRoutes";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Plus } from "lucide-react";
import { format } from "date-fns";
import { AirportCombobox, type AirportSelection } from "@/components/search/AirportCombobox";

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "MMM d, yyyy");
  } catch {
    return d;
  }
}

function formatTimestamp(d: string | null) {
  if (!d) return "—";
  try {
    return format(new Date(d), "MMM d, yyyy HH:mm");
  } catch {
    return d;
  }
}

export default function WatchRoutes() {
  const { profile } = useAuth();
  const { data: routes, isLoading } = useWatchRoutes();
  const createMutation = useCreateWatchRoute();
  const statusMutation = useSetWatchRouteStatus();

  const [origin, setOrigin] = useState<AirportSelection | null>(null);
  const [destination, setDestination] = useState<AirportSelection | null>(null);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [notesDialogContent, setNotesDialogContent] = useState<string | null>(null);

  function validate(): string | null {
    if (!origin) return "Origin airport is required";
    if (!destination) return "Destination airport is required";
    if (!dateStart) return "Start date is required";
    if (!dateEnd) return "End date is required";
    if (dateEnd < dateStart) return "End date must be on or after start date";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast({ title: "Validation error", description: err, variant: "destructive" });
      return;
    }
    try {
      await createMutation.mutateAsync({
        broker_email: profile?.email ?? "",
        broker_name: profile?.display_name ?? "",
        origin_icao: origin!.icao,
        destination_icao: destination!.icao,
        date_start: dateStart,
        date_end: dateEnd,
        notes: notes.trim(),
      });
      toast({ title: "Watch route created" });

      // Fire-and-forget confirmation email
      supabase.functions.invoke("watch-route-confirm", {
        body: {
          broker_email: profile?.email ?? "",
          broker_name: profile?.display_name ?? "",
          origin_icao: origin!.icao,
          origin_label: origin!.label,
          destination_icao: destination!.icao,
          destination_label: destination!.label,
          date_start: dateStart,
          date_end: dateEnd,
          notes: notes.trim(),
        },
      }).catch((emailErr) => {
        console.warn("[watch-route-confirm] Email send failed (non-blocking):", emailErr);
      });

      setOrigin(null);
      setDestination(null);
      setDateStart("");
      setDateEnd("");
      setNotes("");
    } catch (error: unknown) {
      toast({
        title: "Failed to create watch route",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  function handleToggle(route: { id: string; status: string }) {
    const newStatus = route.status === "active" ? "inactive" : "active";
    statusMutation.mutate(
      { watch_route_id: route.id, status: newStatus },
      {
        onSuccess: () => toast({ title: `Watch route ${newStatus}` }),
        onError: (err) =>
          toast({
            title: "Failed to update status",
            description: err instanceof Error ? err.message : "Unknown error",
            variant: "destructive",
          }),
      }
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Watch Routes" description="Monitor routes for new empty leg matches" />

        {/* Create form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4" />
              Create Watch Route
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <div className="space-y-1.5">
                <Label>Origin</Label>
                <AirportCombobox
                  value={origin}
                  onChange={setOrigin}
                  placeholder="Select origin..."
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Destination</Label>
                <AirportCombobox
                  value={destination}
                  onChange={setDestination}
                  placeholder="Select destination..."
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wr-start">Date Start</Label>
                <Input
                  id="wr-start"
                  type="date"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="wr-end">Date End</Label>
                <Input
                  id="wr-end"
                  type="date"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={createMutation.isPending} className="sm:col-span-2 lg:col-span-1">
                {createMutation.isPending ? "Creating…" : "Create"}
              </Button>
              <div className="sm:col-span-2 lg:col-span-5 space-y-1.5">
                <Label htmlFor="wr-notes">Notes (optional)</Label>
                <Textarea
                  id="wr-notes"
                  placeholder="Any additional notes…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={500}
                  rows={2}
                />
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Watch routes table */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Your Watch Routes</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInactive((v) => !v)}
              className="h-7 text-xs"
            >
              {showInactive ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
              {showInactive ? "Hide Inactive" : "Show Inactive"}
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !routes?.length ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No watch routes yet. Create one above to start monitoring.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Route</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Travel Window</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Checked</TableHead>
                      <TableHead>Last Emailed</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(showInactive ? routes : routes.filter((r) => r.status === "active")).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{r.origin_icao} – {r.destination_icao}</TableCell>
                        <TableCell className="text-xs">{r.broker_name || r.broker_email?.split("@")[0] || "—"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatDate(r.date_start)} – {formatDate(r.date_end)}
                        </TableCell>
                        <TableCell
                          className="text-xs max-w-[200px] truncate cursor-pointer hover:text-primary"
                          onClick={() => r.notes && setNotesDialogContent(r.notes)}
                          title={r.notes || undefined}
                        >
                          {r.notes || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.status === "active" ? "default" : "secondary"} className="text-[10px]">
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{formatTimestamp(r.last_checked_at)}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{formatTimestamp(r.last_emailed_at)}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{formatTimestamp(r.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggle(r)}
                            disabled={statusMutation.isPending}
                            className="h-7 px-2"
                          >
                            {r.status === "active" ? (
                              <EyeOff className="h-3.5 w-3.5 mr-1" />
                            ) : (
                              <Eye className="h-3.5 w-3.5 mr-1" />
                            )}
                            {r.status === "active" ? "Pause" : "Resume"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        {/* Notes dialog */}
        <Dialog open={!!notesDialogContent} onOpenChange={(open) => !open && setNotesDialogContent(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Notes</DialogTitle>
            </DialogHeader>
            <p className="text-sm whitespace-pre-wrap">{notesDialogContent}</p>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
