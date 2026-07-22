import { useState, useMemo, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { useCorridorSummaries, useCorridorValidate } from "@/hooks/useCorridors";
import type { CorridorSummary, CorridorValidationIssue } from "@/integrations/external-supabase/types";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CorridorDetailSheet } from "@/components/corridors/CorridorDetailSheet";
import { CorridorFormDialog } from "@/components/corridors/CorridorFormDialog";
import { ValidationResultsDialog } from "@/components/corridors/ValidationResultsDialog";
import {
  CorridorTreeRow,
  buildCorridorTree,
  getAncestorIds,
  getAllNodeIds,
  type CorridorNode,
} from "@/components/corridors/CorridorTreeRow";
import { Search, Plus, CheckCircle, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

export default function Corridors() {
  const [corridorSearch, setCorridorSearch] = useState("");
  const [selectedCorridor, setSelectedCorridor] = useState<CorridorSummary | null>(null);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingCorridor, setEditingCorridor] = useState<CorridorSummary | null>(null);
  const [validationResults, setValidationResults] = useState<CorridorValidationIssue[]>([]);
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: corridors, isLoading: corridorsLoading, error: corridorsError } = useCorridorSummaries();
  const validateMutation = useCorridorValidate();

  // Build tree structure from flat data
  const corridorTree = useMemo(() => {
    if (!corridors) return [];
    return buildCorridorTree(corridors);
  }, [corridors]);

  // Filter corridors and compute which to show (matches + ancestors)
  const { filteredTree, highlightedIds, autoExpandIds } = useMemo(() => {
    if (!corridors || corridorSearch === "") {
      return { filteredTree: corridorTree, highlightedIds: new Set<string>(), autoExpandIds: new Set<string>() };
    }

    const searchLower = corridorSearch.toLowerCase();

    // Find matching corridor IDs
    const matchingIds = new Set<string>();
    corridors.forEach((cor) => {
      if (
        cor.id.toLowerCase().includes(searchLower) ||
        cor.display_name.toLowerCase().includes(searchLower)
      ) {
        matchingIds.add(cor.id);
      }
    });

    // Collect all ancestor IDs for matches
    const ancestorIds = new Set<string>();
    matchingIds.forEach((id) => {
      const ancestors = getAncestorIds(id, corridors);
      ancestors.forEach((a) => ancestorIds.add(a));
    });

    // IDs to show = matches + ancestors
    const visibleIds = new Set([...matchingIds, ...ancestorIds]);

    // Filter tree to only show visible nodes
    function filterTree(nodes: CorridorNode[]): CorridorNode[] {
      return nodes
        .filter((node) => visibleIds.has(node.id))
        .map((node) => ({
          ...node,
          children: filterTree(node.children),
        }));
    }

    return {
      filteredTree: filterTree(corridorTree),
      highlightedIds: matchingIds,
      autoExpandIds: ancestorIds,
    };
  }, [corridors, corridorTree, corridorSearch]);

  // Auto-expand ancestors when searching
  useMemo(() => {
    if (autoExpandIds.size > 0) {
      setExpandedIds((prev) => {
        const newSet = new Set(prev);
        autoExpandIds.forEach((id) => newSet.add(id));
        return newSet;
      });
    }
  }, [autoExpandIds]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    const allIds = getAllNodeIds(corridorTree);
    setExpandedIds(allIds);
  }, [corridorTree]);

  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const handleRowClick = (corridor: CorridorSummary) => {
    setSelectedCorridor(corridor);
    setDetailSheetOpen(true);
  };

  const handleCreateNew = () => {
    setEditingCorridor(null);
    setFormDialogOpen(true);
  };

  const handleEditCorridor = (corridor: CorridorSummary) => {
    setEditingCorridor(corridor);
    setFormDialogOpen(true);
  };

  const handleFormSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['external', 'corridor_summaries'] });
    if (editingCorridor && selectedCorridor?.id === editingCorridor.id) {
      queryClient.invalidateQueries({ queryKey: ['external', 'corridor_membership'] });
    }
  };

  const handleValidate = async () => {
    try {
      const results = await validateMutation.mutateAsync();
      setValidationResults(results);
      setValidationDialogOpen(true);

      if (results.length === 0) {
        toast({
          title: "Validation passed",
          description: "All corridors passed validation checks.",
        });
      } else {
        const errorCount = results.filter((r) => r.severity === "error").length;
        const warnCount = results.filter((r) => r.severity === "warn").length;
        toast({
          title: "Validation complete",
          description: `Found ${results.length} issue${results.length !== 1 ? "s" : ""}: ${errorCount} error${errorCount !== 1 ? "s" : ""}, ${warnCount} warning${warnCount !== 1 ? "s" : ""}.`,
          variant: errorCount > 0 ? "destructive" : "default",
        });
      }
    } catch (error) {
      toast({
        title: "Validation failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  if (corridorsError) {
    return (
      <DashboardLayout>
        <PageHeader title="Corridors" description="Error loading data" />
        <div className="bg-destructive/10 border border-destructive rounded-md p-4">
          <p className="text-destructive">Failed to load data: {corridorsError.message}</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Corridors"
        description="Manage geographic routing logic and corridor memberships"
      />

      <FilterBar>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search corridors..."
            value={corridorSearch}
            onChange={(e) => setCorridorSearch(e.target.value)}
            className="pl-9 w-[280px] bg-secondary border-border"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleExpandAll} className="gap-1">
            <ChevronDown className="h-4 w-4" />
            Expand All
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCollapseAll} className="gap-1">
            <ChevronRight className="h-4 w-4" />
            Collapse All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleValidate}
            disabled={validateMutation.isPending}
            className="gap-1"
          >
            {validateMutation.isPending ? (
              <>Validating...</>
            ) : (
              <>
                <CheckCircle className="h-4 w-4" />
                Validate
              </>
            )}
          </Button>
          <Button size="sm" className="gap-1" onClick={handleCreateNew}>
            <Plus className="h-4 w-4" />
            New Corridor
          </Button>
        </div>
      </FilterBar>

      {corridorsLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden bg-card">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border text-sm font-medium text-muted-foreground">
            <div className="w-5 shrink-0" />
            <span className="min-w-[180px]">ID</span>
            <span className="flex-1">Display Name</span>
            <span className="w-24 text-center">Purpose</span>
            <span className="w-20 text-center">Selectable</span>
            <span className="w-20 text-center">Airports</span>
            <span className="w-16 text-center">Active</span>
          </div>

          {/* Tree rows */}
          {filteredTree.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground">
              No corridors found
            </div>
          ) : (
            filteredTree.map((node) => (
              <CorridorTreeRow
                key={node.id}
                node={node}
                onRowClick={handleRowClick}
                expandedIds={expandedIds}
                onToggleExpand={handleToggleExpand}
                highlightedIds={highlightedIds}
              />
            ))
          )}
        </div>
      )}

      {/* Detail Sheet */}
      <CorridorDetailSheet
        corridor={selectedCorridor}
        open={detailSheetOpen}
        onOpenChange={setDetailSheetOpen}
        onEditCorridor={handleEditCorridor}
      />

      {/* Create/Edit Form Dialog */}
      <CorridorFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        corridor={editingCorridor}
        onSuccess={handleFormSuccess}
      />

      {/* Validation Results Dialog */}
      <ValidationResultsDialog
        open={validationDialogOpen}
        onOpenChange={setValidationDialogOpen}
        issues={validationResults}
        isLoading={validateMutation.isPending}
      />
    </DashboardLayout>
  );
}
