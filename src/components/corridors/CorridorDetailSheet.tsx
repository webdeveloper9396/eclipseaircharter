import { useState, useMemo } from "react";
import type { CorridorSummary, Airport } from "@/integrations/external-supabase/types";
import {
  useCorridorMembership,
  useCorridorAirportUpsertV2,
  useCorridorAirportRemoveV2,
  useAirportsSearchFiltered,
  useCorridorInheritedMembers,
  type CorridorMembershipWithAirport,
  type InheritedMember,
} from "@/hooks/useCorridors";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Search, Plus, Trash2, Edit2, Check, X, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/use-debounce";

interface CorridorDetailSheetProps {
  corridor: CorridorSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEditCorridor: (corridor: CorridorSummary) => void;
}

export function CorridorDetailSheet({
  corridor,
  open,
  onOpenChange,
  onEditCorridor,
}: CorridorDetailSheetProps) {
  const [airportSearch, setAirportSearch] = useState("");
  const [addingPriority, setAddingPriority] = useState("");
  const [editingMembership, setEditingMembership] = useState<string | null>(null);
  const [editPriority, setEditPriority] = useState("");
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [showInherited, setShowInherited] = useState(false);
  
  const debouncedAirportSearch = useDebounce(airportSearch, 300);
  const { toast } = useToast();

  const { data: membership, isLoading: membershipLoading } = useCorridorMembership(
    corridor?.id
  );
  const { data: inheritedMembers, isLoading: inheritedLoading } = useCorridorInheritedMembers(
    corridor?.id
  );
  const { data: searchedAirports, isLoading: airportSearchLoading } = useAirportsSearchFiltered(
    debouncedAirportSearch
  );
  
  const upsertMutation = useCorridorAirportUpsertV2();
  const removeMutation = useCorridorAirportRemoveV2();

  // Filter searched airports to exclude those already in corridor (direct)
  const availableAirports = useMemo(() => {
    if (!searchedAirports || !membership) return searchedAirports || [];
    const existingCodes = new Set(membership.map(m => m.airport_code));
    return searchedAirports.filter(a => !existingCodes.has(a.icao));
  }, [searchedAirports, membership]);

  // Filter inherited members to exclude those directly added
  const filteredInheritedMembers = useMemo(() => {
    if (!inheritedMembers) return [];
    if (!membership || membership.length === 0) return inheritedMembers;
    const directCodes = new Set(membership.map(m => m.airport_code));
    return inheritedMembers.filter(m => !directCodes.has(m.airport_code));
  }, [inheritedMembers, membership]);

  // Check if any memberships need normalization (side != 'both')
  const needsNormalization = useMemo(() => {
    if (!membership) return false;
    return membership.some(m => m.side !== 'both');
  }, [membership]);

  // Parse priority: empty string -> null, otherwise parse as number
  const parsePriority = (value: string): number | null => {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = parseInt(trimmed, 10);
    return isNaN(parsed) ? null : parsed;
  };

  const handleAddAirport = async (airport: Airport) => {
    if (!corridor) return;

    try {
      await upsertMutation.mutateAsync({
        p_corridor_id: corridor.id,
        p_airport_code: airport.icao,
        p_side: 'both', // Always enforce 'both'
        p_priority: parsePriority(addingPriority),
      });
      
      toast({
        title: "Airport added",
        description: `Added ${airport.icao} to ${corridor.display_name}. Action logged.`,
      });
      
      setAirportSearch("");
      setAddingPriority("");
    } catch (error: unknown) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : (error && typeof error === 'object' && 'message' in error) 
          ? String((error as { message: unknown }).message)
          : String(error);
      toast({
        title: "Error adding airport",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleRemoveAirport = async (airportCode: string) => {
    if (!corridor) return;

    try {
      await removeMutation.mutateAsync({
        p_corridor_id: corridor.id,
        p_airport_code: airportCode,
      });
      
      toast({
        title: "Airport removed",
        description: `Removed ${airportCode} from ${corridor.display_name}. Action logged.`,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : (error && typeof error === 'object' && 'message' in error) 
          ? String((error as { message: unknown }).message)
          : String(error);
      toast({
        title: "Error removing airport",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const startEditing = (m: CorridorMembershipWithAirport) => {
    setEditingMembership(m.airport_code);
    setEditPriority(m.priority !== null ? String(m.priority) : "");
  };

  const handleUpdateMembership = async (airportCode: string) => {
    if (!corridor) return;

    try {
      // Always enforce side='both' on save
      await upsertMutation.mutateAsync({
        p_corridor_id: corridor.id,
        p_airport_code: airportCode,
        p_side: 'both',
        p_priority: parsePriority(editPriority),
      });
      
      toast({
        title: "Membership updated",
        description: `Updated ${airportCode} in ${corridor.display_name}. Action logged.`,
      });
      
      setEditingMembership(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : (error && typeof error === 'object' && 'message' in error) 
          ? String((error as { message: unknown }).message)
          : String(error);
      toast({
        title: "Error updating membership",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleNormalizeSides = async () => {
    if (!corridor || !membership) return;
    
    const toNormalize = membership.filter(m => m.side !== 'both');
    if (toNormalize.length === 0) {
      toast({
        title: "Already normalized",
        description: "All memberships already have side='both'.",
      });
      return;
    }

    setIsNormalizing(true);
    let successCount = 0;
    let errorCount = 0;

    for (const m of toNormalize) {
      try {
        await upsertMutation.mutateAsync({
          p_corridor_id: corridor.id,
          p_airport_code: m.airport_code,
          p_side: 'both',
          p_priority: m.priority,
        });
        successCount++;
      } catch {
        errorCount++;
      }
    }

    setIsNormalizing(false);
    
    if (errorCount === 0) {
      toast({
        title: "Normalization complete",
        description: `Updated ${successCount} membership(s) to side='both'.`,
      });
    } else {
      toast({
        title: "Normalization partially failed",
        description: `Updated ${successCount}, failed ${errorCount}.`,
        variant: "destructive",
      });
    }
  };

  const cancelEditing = () => {
    setEditingMembership(null);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setAirportSearch("");
      setEditingMembership(null);
      setShowInherited(false);
    }
    onOpenChange(isOpen);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent className="w-[560px] bg-card border-border overflow-y-auto">
        {corridor && (
          <>
            <SheetHeader>
              <div className="flex items-center justify-between">
                <SheetTitle className="font-mono">{corridor.id}</SheetTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEditCorridor(corridor)}
                  className="gap-1"
                >
                  <Edit2 className="h-4 w-4" />
                  Edit
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{corridor.display_name}</p>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {/* Summary info */}
              <div className="bg-secondary rounded-md p-4 space-y-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Purpose:</span>{" "}
                    <Badge variant="outline" className="ml-1">{corridor.purpose}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground">User Selectable:</span>{" "}
                    <span>{corridor.user_selectable ? "Yes" : "No"}</span>
                  </div>
                  {corridor.expansion_parent_display_name && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Parent:</span>{" "}
                      <span>{corridor.expansion_parent_display_name}</span>
                    </div>
                  )}
                  {corridor.picker_rank !== null && (
                    <div>
                      <span className="text-muted-foreground">Picker Rank:</span>{" "}
                      <span>{corridor.picker_rank}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Active:</span>{" "}
                    <Badge variant={corridor.active ? "default" : "secondary"}>
                      {corridor.active ? "Yes" : "No"}
                    </Badge>
                  </div>
                </div>
                {corridor.synonyms && corridor.synonyms.length > 0 && (
                  <div className="pt-2 border-t border-border">
                    <span className="text-xs text-muted-foreground">Synonyms:</span>
                    <div className="flex gap-1 flex-wrap mt-1">
                      {corridor.synonyms.map((s, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Add Airport Section */}
              <div>
                <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                  Add Airport
                </h4>
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by ICAO, IATA, or city..."
                      value={airportSearch}
                      onChange={(e) => setAirportSearch(e.target.value)}
                      className="pl-9 bg-secondary border-border"
                    />
                  </div>
                  
                  <div className="flex gap-2 items-end">
                    <div className="w-24">
                      <Label className="text-xs">Priority</Label>
                      <Input
                        type="number"
                        value={addingPriority}
                        onChange={(e) => setAddingPriority(e.target.value)}
                        placeholder="(optional)"
                        className="bg-secondary border-border h-8 text-sm"
                      />
                    </div>
                    <span className="text-xs text-muted-foreground pb-2">
                      Leave blank for null
                    </span>
                  </div>

                  {airportSearch && (
                    <ScrollArea className="h-[160px] rounded-md border border-border bg-secondary">
                      {airportSearchLoading ? (
                        <div className="p-2 space-y-2">
                          <Skeleton className="h-8 w-full" />
                          <Skeleton className="h-8 w-full" />
                        </div>
                      ) : availableAirports && availableAirports.length > 0 ? (
                        <div className="p-1">
                          {availableAirports.slice(0, 10).map((airport) => (
                            <button
                              key={airport.id}
                              onClick={() => handleAddAirport(airport)}
                              disabled={upsertMutation.isPending}
                              className="w-full text-left px-3 py-2 rounded hover:bg-muted transition-colors flex items-center justify-between group disabled:opacity-50"
                            >
                              <div>
                                <span className="font-mono font-medium">{airport.icao}</span>
                                {airport.iata && (
                                  <span className="text-muted-foreground ml-2 text-sm">({airport.iata})</span>
                                )}
                                <span className="text-muted-foreground ml-3 text-sm">
                                  {airport.city || airport.name}
                                  {airport.country && ` · ${airport.country}`}
                                </span>
                              </div>
                              <Plus className="h-4 w-4 opacity-0 group-hover:opacity-50" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                          No airports found
                        </div>
                      )}
                    </ScrollArea>
                  )}
                </div>
              </div>

              {/* Direct Members Section (Editable) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs text-muted-foreground uppercase tracking-wider">
                    Direct Members ({membership?.length ?? 0})
                  </h4>
                  {needsNormalization && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNormalizeSides}
                      disabled={isNormalizing}
                      className="gap-1 text-xs h-7"
                    >
                      <RefreshCw className={`h-3 w-3 ${isNormalizing ? 'animate-spin' : ''}`} />
                      Normalize sides
                    </Button>
                  )}
                </div>

                <div className="bg-secondary rounded-md">
                  {membershipLoading ? (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                      Loading...
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left px-3 py-2 text-xs text-muted-foreground uppercase">ICAO</th>
                          <th className="text-left px-3 py-2 text-xs text-muted-foreground uppercase">IATA</th>
                          <th className="text-left px-3 py-2 text-xs text-muted-foreground uppercase">Location</th>
                          <th className="text-left px-3 py-2 text-xs text-muted-foreground uppercase">Priority</th>
                          <th className="w-16"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(membership || []).map((m) => (
                          <tr key={m.airport_code} className="border-b border-border last:border-0">
                            <td className="px-3 py-2 font-mono">{m.airport_code}</td>
                            <td className="px-3 py-2 font-mono text-muted-foreground">
                              {m.airport?.iata || "—"}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {m.airport?.city || "—"}
                              {m.airport?.state && `, ${m.airport.state}`}
                              {m.airport?.country && ` · ${m.airport.country}`}
                            </td>
                            <td className="px-3 py-2">
                              {editingMembership === m.airport_code ? (
                                <Input
                                  type="number"
                                  value={editPriority}
                                  onChange={(e) => setEditPriority(e.target.value)}
                                  placeholder="null"
                                  className="h-7 w-16 text-xs"
                                />
                              ) : (
                                <span className="tabular-nums">{m.priority ?? "—"}</span>
                              )}
                            </td>
                            <td className="px-2">
                              {editingMembership === m.airport_code ? (
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => handleUpdateMembership(m.airport_code)}
                                    disabled={upsertMutation.isPending}
                                  >
                                    <Check className="h-3 w-3 text-green-500" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={cancelEditing}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                    onClick={() => startEditing(m)}
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                  <ConfirmDialog
                                    trigger={
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    }
                                    title="Remove from Corridor"
                                    description={`This will remove ${m.airport_code} from ${corridor.display_name}. Action will be logged.`}
                                    confirmLabel="Remove"
                                    dangerous
                                    onConfirm={() => handleRemoveAirport(m.airport_code)}
                                  />
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                        {(!membership || membership.length === 0) && (
                          <tr>
                            <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                              No direct members
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Inherited Members Section (Read-only, behind toggle) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h4 className="text-xs text-muted-foreground uppercase tracking-wider">
                      Inherited Members ({filteredInheritedMembers.length})
                    </h4>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="show-inherited"
                        checked={showInherited}
                        onCheckedChange={setShowInherited}
                        className="scale-75"
                      />
                      <Label htmlFor="show-inherited" className="text-xs text-muted-foreground cursor-pointer">
                        Show
                      </Label>
                    </div>
                  </div>
                </div>

                {showInherited && (
                  <div className="bg-secondary rounded-md">
                    {inheritedLoading ? (
                      <div className="p-4 text-center text-muted-foreground text-sm">
                        Loading...
                      </div>
                    ) : filteredInheritedMembers.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground text-sm">
                        No inherited members
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left px-3 py-2 text-xs text-muted-foreground uppercase">ICAO</th>
                            <th className="text-left px-3 py-2 text-xs text-muted-foreground uppercase">IATA</th>
                            <th className="text-left px-3 py-2 text-xs text-muted-foreground uppercase">Location</th>
                            <th className="text-left px-3 py-2 text-xs text-muted-foreground uppercase">Source</th>
                            <th className="text-left px-3 py-2 text-xs text-muted-foreground uppercase">Depth</th>
                            <th className="text-left px-3 py-2 text-xs text-muted-foreground uppercase">Priority</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredInheritedMembers.map((m) => (
                            <tr key={m.airport_code} className="border-b border-border last:border-0">
                              <td className="px-3 py-2 font-mono">{m.airport_code}</td>
                              <td className="px-3 py-2 font-mono text-muted-foreground">
                                {m.airport?.iata || "—"}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground text-xs">
                                {m.airport?.city || m.airport?.name || "—"}
                                {m.airport?.country && ` · ${m.airport.country}`}
                              </td>
                              <td className="px-3 py-2">
                                <Badge variant="outline" className="text-xs font-mono">
                                  {m.source_corridor_id}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 tabular-nums">{m.resolved_depth}</td>
                              <td className="px-3 py-2 tabular-nums">{m.resolved_priority ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
