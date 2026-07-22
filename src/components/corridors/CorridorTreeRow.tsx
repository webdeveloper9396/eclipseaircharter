import { useState, useCallback } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { CorridorSummary } from "@/integrations/external-supabase/types";
import { cn } from "@/lib/utils";

export interface CorridorNode extends CorridorSummary {
  children: CorridorNode[];
  depth: number;
}

interface CorridorTreeRowProps {
  node: CorridorNode;
  onRowClick: (corridor: CorridorSummary) => void;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  highlightedIds?: Set<string>;
}

export function CorridorTreeRow({
  node,
  onRowClick,
  expandedIds,
  onToggleExpand,
  highlightedIds,
}: CorridorTreeRowProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isHighlighted = highlightedIds?.has(node.id);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleExpand(node.id);
    },
    [node.id, onToggleExpand]
  );

  const handleRowClick = useCallback(() => {
    onRowClick(node);
  }, [node, onRowClick]);

  return (
    <div className="w-full">
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-2 hover:bg-muted/50 cursor-pointer border-b border-border transition-colors",
          isHighlighted && "bg-primary/10"
        )}
        style={{ paddingLeft: `${node.depth * 24 + 16}px` }}
        onClick={handleRowClick}
      >
        {/* Expand/Collapse Toggle */}
        <div className="w-5 h-5 flex items-center justify-center shrink-0">
          {hasChildren ? (
            <button
              onClick={handleToggle}
              className="p-0.5 rounded hover:bg-muted"
              aria-label={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          ) : null}
        </div>

        {/* ID */}
        <span
          className={cn(
            "font-mono font-medium min-w-[180px]",
            isHighlighted && "text-primary font-semibold"
          )}
        >
          {node.id}
        </span>

        {/* Display Name */}
        <span className="flex-1 truncate text-sm">{node.display_name}</span>

        {/* Purpose Badge */}
        <Badge variant="outline" className="capitalize w-24 justify-center">
          {node.purpose}
        </Badge>

        {/* Selectable */}
        <span className="text-muted-foreground text-sm w-20 text-center">
          {node.user_selectable ? "Yes" : "—"}
        </span>

        {/* Airport Count */}
        <Badge variant="secondary" className="tabular-nums w-20 justify-center">
          {node.airport_count}
        </Badge>

        {/* Active */}
        <Badge
          variant={node.active ? "default" : "secondary"}
          className="w-16 justify-center"
        >
          {node.active ? "Yes" : "No"}
        </Badge>
      </div>

      {/* Children */}
      {hasChildren && (
        <Collapsible open={isExpanded}>
          <CollapsibleContent>
            {node.children.map((child) => (
              <CorridorTreeRow
                key={child.id}
                node={child}
                onRowClick={onRowClick}
                expandedIds={expandedIds}
                onToggleExpand={onToggleExpand}
                highlightedIds={highlightedIds}
              />
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// Utility function to build the tree from flat data
export function buildCorridorTree(corridors: CorridorSummary[]): CorridorNode[] {
  const corridorMap = new Map<string, CorridorSummary>();
  const childrenMap = new Map<string, CorridorSummary[]>();
  const visited = new Set<string>();

  // Build lookup maps
  corridors.forEach((cor) => {
    corridorMap.set(cor.id, cor);
    if (cor.expansion_parent_id) {
      const existing = childrenMap.get(cor.expansion_parent_id) || [];
      existing.push(cor);
      childrenMap.set(cor.expansion_parent_id, existing);
    }
  });

  // Recursive builder with cycle detection
  function buildNode(corridor: CorridorSummary, depth: number): CorridorNode | null {
    if (visited.has(corridor.id)) {
      return null; // Prevent cycles
    }
    visited.add(corridor.id);

    const children = childrenMap.get(corridor.id) || [];
    const childNodes: CorridorNode[] = [];

    for (const child of children) {
      const childNode = buildNode(child, depth + 1);
      if (childNode) {
        childNodes.push(childNode);
      }
    }

    // Sort children by display_name
    childNodes.sort((a, b) => a.display_name.localeCompare(b.display_name));

    return {
      ...corridor,
      children: childNodes,
      depth,
    };
  }

  // Find root nodes (no parent or orphans)
  const roots: CorridorNode[] = [];

  corridors.forEach((cor) => {
    // Root if no parent
    if (!cor.expansion_parent_id) {
      const node = buildNode(cor, 0);
      if (node) roots.push(node);
    }
    // Orphan if parent doesn't exist in data
    else if (!corridorMap.has(cor.expansion_parent_id) && !visited.has(cor.id)) {
      const node = buildNode(cor, 0);
      if (node) roots.push(node);
    }
  });

  // Sort roots by display_name
  roots.sort((a, b) => a.display_name.localeCompare(b.display_name));

  return roots;
}

// Get all ancestor IDs for a corridor
export function getAncestorIds(
  corridorId: string,
  corridors: CorridorSummary[]
): Set<string> {
  const corridorMap = new Map<string, CorridorSummary>();
  corridors.forEach((c) => corridorMap.set(c.id, c));

  const ancestors = new Set<string>();
  let current = corridorMap.get(corridorId);
  const visited = new Set<string>();

  while (current?.expansion_parent_id && !visited.has(current.id)) {
    visited.add(current.id);
    ancestors.add(current.expansion_parent_id);
    current = corridorMap.get(current.expansion_parent_id);
  }

  return ancestors;
}

// Get IDs of all descendants of a corridor
export function getDescendantIds(
  node: CorridorNode
): Set<string> {
  const ids = new Set<string>();
  
  function collect(n: CorridorNode) {
    n.children.forEach(child => {
      ids.add(child.id);
      collect(child);
    });
  }
  
  collect(node);
  return ids;
}

// Flatten tree to get all node IDs
export function getAllNodeIds(nodes: CorridorNode[]): Set<string> {
  const ids = new Set<string>();
  
  function collect(node: CorridorNode) {
    ids.add(node.id);
    node.children.forEach(collect);
  }
  
  nodes.forEach(collect);
  return ids;
}
