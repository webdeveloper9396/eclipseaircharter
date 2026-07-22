import { useState, useMemo } from "react";
import { useCorridorRecommendations } from "@/hooks/useExternalData";
import { useDeleteCorridorRecommendation } from "@/hooks/useExternalMutations";
import { DataTable, Column } from "@/components/dashboard/DataTable";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import type { CorridorRecommendation, CandidateAirport } from "@/integrations/external-supabase/types";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function CorridorRecommendationsSection() {
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState("open");
  const [sourceVendorFilter, setSourceVendorFilter] = useState("all");
  const [sideFilter, setSideFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [selected, setSelected] = useState<CorridorRecommendation | null>(null);

  const { data, isLoading, error, refetch } = useCorridorRecommendations(
    statusFilter,
    sourceVendorFilter,
    sideFilter,
    searchText
  );

  const deleteMutation = useDeleteCorridorRecommendation();

  const sourceVendors = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.map((r) => r.source_vendor))].sort();
  }, [data]);

  const handleDelete = (id: string) => {
    deleteMutation.mutate(
      { p_id: id },
      {
        onSuccess: () => {
          toast({ title: "Recommendation deleted" });
          setSelected(null);
        },
        onError: (err) => {
          toast({
            title: "Failed to delete",
            description: err instanceof Error ? err.message : "Unknown error",
            variant: "destructive",
          });
        },
      }
    );
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const columns: Column<CorridorRecommendation>[] = [
    {
      key: "raw_label",
      header: "Raw Label",
      render: (r) => <span className="font-medium text-sm">{r.raw_label}</span>,
    },
    {
      key: "side",
      header: "Side",
      render: (r) => (
        <Badge variant="outline" className="text-xs capitalize">
          {r.side}
        </Badge>
      ),
      className: "w-28",
    },
    {
      key: "source_vendor",
      header: "Source",
      render: (r) => <span className="text-sm">{r.source_vendor}</span>,
      className: "w-28",
    },
    {
      key: "suggested_display_name",
      header: "Suggested Name",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{r.suggested_display_name || "—"}</span>
      ),
    },
    {
      key: "candidate_airport_icaos",
      header: "Candidate ICAOs",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {(r.candidate_airport_icaos || []).map((icao) => (
            <Badge key={icao} variant="secondary" className="text-xs font-mono">
              {icao}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: "recommended_reason",
      header: "Reason",
      render: (r) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {r.recommended_reason || "—"}
        </span>
      ),
    },
    {
      key: "created_at",
      header: "Created",
      render: (r) => (
        <span className="text-muted-foreground tabular-nums text-sm">
          {formatDate(r.created_at)}
        </span>
      ),
      className: "w-36",
    },
  ];

  const count = data?.length || 0;

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Corridor Recommendations</h2>
          {count > 0 && (
            <Badge variant="secondary" className="text-xs">
              {count}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          className="text-muted-foreground"
        >
          <RefreshCw className="h-4 w-4 mr-1" />
          Refresh
        </Button>
      </div>

      <FilterBar>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] bg-secondary border-border">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sourceVendorFilter} onValueChange={setSourceVendorFilter}>
          <SelectTrigger className="w-[140px] bg-secondary border-border">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">All Sources</SelectItem>
            {sourceVendors.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sideFilter} onValueChange={setSideFilter}>
          <SelectTrigger className="w-[140px] bg-secondary border-border">
            <SelectValue placeholder="Side" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            <SelectItem value="all">All Sides</SelectItem>
            <SelectItem value="origin">Origin</SelectItem>
            <SelectItem value="destination">Destination</SelectItem>
            <SelectItem value="both">Both</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Search raw label…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="w-[200px] bg-secondary border-border"
        />
      </FilterBar>

      {error ? (
        <div className="bg-destructive/10 border border-destructive rounded-md p-4">
          <p className="text-destructive text-sm">
            Failed to load recommendations: {error.message}
          </p>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <DataTable<CorridorRecommendation>
          columns={columns}
          data={data || []}
          keyExtractor={(r) => r.id}
          onRowClick={(r) => setSelected(r)}
          emptyMessage="No open corridor recommendations"
        />
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent className="w-[560px] bg-card border-border overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <span>{selected.raw_label}</span>
                  <Badge variant="outline" className="capitalize text-xs">
                    {selected.side}
                  </Badge>
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Basic info */}
                <section className="bg-secondary rounded-md p-4 space-y-3">
                  <DetailField label="Status" value={selected.status} />
                  <DetailField label="Source Vendor" value={selected.source_vendor} />
                  <DetailField label="Suggested Name" value={selected.suggested_display_name} />
                  <DetailField label="Reason" value={selected.recommended_reason} />
                  <DetailField label="Operator ID" value={selected.operator_id} mono />
                  <DetailField label="Source ID" value={selected.operator_source_id} mono />
                  <DetailField label="Accepted Corridor" value={selected.accepted_corridor_id} mono />
                  <DetailField label="Notes" value={selected.notes} />
                  <DetailField label="Created" value={formatDate(selected.created_at)} />
                </section>

                {/* Suggested Synonyms */}
                {selected.suggested_synonyms && selected.suggested_synonyms.length > 0 && (
                  <section>
                    <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                      Suggested Synonyms
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.suggested_synonyms.map((s, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </section>
                )}

                {/* Candidate Airports */}
                {selected.candidate_airports && selected.candidate_airports.length > 0 && (
                  <section>
                    <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                      Candidate Airports
                    </h3>
                    <div className="rounded-md border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-table-header hover:bg-table-header">
                            <TableHead className="text-xs">ICAO</TableHead>
                            <TableHead className="text-xs">IATA</TableHead>
                            <TableHead className="text-xs">Name</TableHead>
                            <TableHead className="text-xs">City</TableHead>
                            <TableHead className="text-xs">State</TableHead>
                            <TableHead className="text-xs">Country</TableHead>
                            <TableHead className="text-xs text-right">Score</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selected.candidate_airports.map((a: CandidateAirport, i: number) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs">{a.icao}</TableCell>
                              <TableCell className="text-xs">{a.iata || "—"}</TableCell>
                              <TableCell className="text-xs">{a.name || "—"}</TableCell>
                              <TableCell className="text-xs">{a.city || "—"}</TableCell>
                              <TableCell className="text-xs">{a.state || "—"}</TableCell>
                              <TableCell className="text-xs">{a.country || "—"}</TableCell>
                              <TableCell className="text-xs text-right tabular-nums">
                                {a.score != null ? a.score.toFixed(2) : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </section>
                )}

                {/* Delete Action */}
                <section>
                  <ConfirmDialog
                    trigger={
                      <Button
                        variant="outline"
                        className="w-full justify-start border-destructive/50 text-destructive hover:bg-destructive/10"
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {deleteMutation.isPending ? "Deleting…" : "Delete Recommendation"}
                      </Button>
                    }
                    title="Delete Recommendation"
                    description={`Permanently delete the recommendation for "${selected.raw_label}"? This cannot be undone.`}
                    confirmLabel="Delete"
                    dangerous
                    onConfirm={() => handleDelete(selected.id)}
                  />
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function DetailField({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className={`text-sm ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
    </div>
  );
}
