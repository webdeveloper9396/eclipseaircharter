import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatusIndicator } from "@/components/dashboard/StatusIndicator";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAircraftTypeAliases, useAircraftTypeImages } from "@/hooks/useExternalData";
import {
  useAircraftTypeAddAlias,
  useAircraftTypeAliasLookup,
  useAircraftTypeRemoveAlias,
} from "@/hooks/useExternalMutations";
import { AircraftImageManager } from "@/components/aircraft/AircraftImageManager";
import type { AircraftType, AircraftCategory } from "@/integrations/external-supabase/types";


interface AircraftTypeDetailSheetProps {
  selectedType: AircraftType | null;
  onClose: () => void;
  categories: AircraftCategory[];
}

export function AircraftTypeDetailSheet({
  selectedType,
  onClose,
  categories,
}: AircraftTypeDetailSheetProps) {
  const [newAlias, setNewAlias] = useState("");
  const [confirmAddAlias, setConfirmAddAlias] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<{
    manufacturer: string;
    model: string;
    category_id: string | null;
  } | null>(null);
  const { toast } = useToast();

  const { data: aliases, refetch: refetchAliases } = useAircraftTypeAliases(selectedType?.id);
  const { data: images, refetch: refetchImages } = useAircraftTypeImages(selectedType?.id);
  const addAliasMutation = useAircraftTypeAddAlias();
  const lookupMutation = useAircraftTypeAliasLookup();
  const removeAliasMutation = useAircraftTypeRemoveAlias();


  const categoryMap = new Map((categories || []).map((cat) => [cat.id, cat.display_name]));

  const formatCategoryId = (categoryId: string | null) => {
    if (!categoryId) return "—";
    const catName = categoryMap.get(categoryId);
    if (catName) return catName;
    return categoryId
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const handleAddAliasClick = () => {
    if (!newAlias.trim()) {
      toast({
        title: "Validation Error",
        description: "Alias cannot be empty.",
        variant: "destructive",
      });
      return;
    }
    setDuplicateInfo(null);
    setConfirmAddAlias(true);
  };

  const handleConfirmAddAlias = async () => {
    if (!selectedType) return;

    const aliasToAdd = newAlias.trim();

    try {
      const result = await addAliasMutation.mutateAsync({
        p_aircraft_type_id: selectedType.id,
        p_alias: aliasToAdd,
      });

      // Check if RPC explicitly returned created: false
      // Some RPCs return the created record on success, others return {created: boolean}
      const wasCreated = result === null || result === undefined || 
        (typeof result === 'object' && (result as { created?: boolean }).created !== false);

      if (wasCreated) {
        toast({
          title: "Alias added",
          description: `Added "${aliasToAdd}" to ${selectedType.manufacturer} ${selectedType.model}. Action logged.`,
        });
        setNewAlias("");
        setDuplicateInfo(null);
        refetchAliases();
      } else {
        // Alias already exists - look it up to show which aircraft it's mapped to
        try {
          const lookupResult = await lookupMutation.mutateAsync({
            p_alias: aliasToAdd,
          });

          if (lookupResult && lookupResult.manufacturer) {
            setDuplicateInfo({
              manufacturer: lookupResult.manufacturer,
              model: lookupResult.model,
              category_id: lookupResult.category_id,
            });
          } else {
            toast({
              title: "Alias already exists",
              description: "The alias could not be added because it's already in use.",
              variant: "destructive",
            });
          }
        } catch (lookupError) {
          toast({
            title: "Alias already exists",
            description: "The alias could not be added because it's already in use.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      // Check if error message indicates duplicate
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.toLowerCase().includes('already exists') || 
          errorMessage.toLowerCase().includes('duplicate')) {
        // Try to look up the existing alias
        try {
          const lookupResult = await lookupMutation.mutateAsync({
            p_alias: aliasToAdd,
          });

          if (lookupResult && lookupResult.manufacturer) {
            setDuplicateInfo({
              manufacturer: lookupResult.manufacturer,
              model: lookupResult.model,
              category_id: lookupResult.category_id,
            });
          } else {
            toast({
              title: "Error adding alias",
              description: errorMessage,
              variant: "destructive",
            });
          }
        } catch {
          toast({
            title: "Error adding alias",
            description: errorMessage,
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Error adding alias",
          description: errorMessage,
          variant: "destructive",
        });
      }
    }
    setConfirmAddAlias(false);
  };

  const handleRemoveAlias = async (aliasId: string) => {
    if (!selectedType) return;

    try {
      await removeAliasMutation.mutateAsync({
        p_alias_id: aliasId,
        aircraft_type_id: selectedType.id,
      });
      toast({
        title: "Alias removed",
        description: "Action logged.",
      });
    } catch (error) {
      toast({
        title: "Error removing alias",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Sheet open={!!selectedType} onOpenChange={() => onClose()}>
        <SheetContent className="w-[500px] bg-card border-border overflow-y-auto">
          {selectedType && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {selectedType.manufacturer} {selectedType.model}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                <div className="bg-secondary rounded-md p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Category</span>
                    <Badge variant="outline" className="bg-badge-muted border-border">
                      {formatCategoryId(selectedType.category_id)}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <StatusIndicator
                      status={selectedType.active ? "active" : "inactive"}
                      label={selectedType.active ? "Active" : "Inactive"}
                    />
                  </div>
                  {selectedType.pax_capacity && (
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Passenger Capacity</span>
                      <span className="tabular-nums">{selectedType.pax_capacity}</span>
                    </div>
                  )}
                  {selectedType.range_nm && (
                    <div className="flex justify-between">
                      <span className="text-xs text-muted-foreground">Range</span>
                      <span className="tabular-nums">
                        {selectedType.range_nm.toLocaleString()} nm
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                    Aliases
                  </h4>
                  <div className="bg-secondary rounded-md p-4">
                    <div className="space-y-2">
                      {aliases && aliases.length > 0 ? (
                        aliases.map((alias) => (
                          <div
                            key={alias.id}
                            className="flex items-center justify-between py-2 border-b border-border last:border-0"
                          >
                            <span className="font-mono text-sm">{alias.alias}</span>
                            <ConfirmDialog
                              trigger={
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              }
                              title="Remove Alias"
                              description="This will remove the alias mapping. Unresolved strings may reappear. Action logged."
                              confirmLabel="Remove"
                              dangerous
                              onConfirm={() => handleRemoveAlias(alias.id)}
                            />
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">No aliases configured</p>
                      )}
                    </div>
                  </div>

                  {duplicateInfo && (
                    <div className="mt-3 p-3 bg-destructive/10 border border-destructive/30 rounded-md flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-destructive">
                        Alias already exists and is mapped to{" "}
                        <strong>
                          {duplicateInfo.manufacturer} {duplicateInfo.model}
                        </strong>{" "}
                        ({formatCategoryId(duplicateInfo.category_id)}).
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 mt-3">
                    <Input
                      placeholder="Add new alias..."
                      value={newAlias}
                      onChange={(e) => {
                        setNewAlias(e.target.value);
                        setDuplicateInfo(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddAliasClick();
                        }
                      }}
                      className="bg-secondary border-border"
                    />
                    <Button
                      onClick={handleAddAliasClick}
                      variant="outline"
                      className="bg-secondary border-border"
                      disabled={addAliasMutation.isPending}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                </div>
              </div>

              {/* Images section */}
              <div>
                <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-3">
                  Images
                </h4>
                <div className="bg-secondary rounded-md p-4">
                  <AircraftImageManager
                    aircraftTypeId={selectedType.id}
                    images={images ?? null}
                    onUpdated={() => refetchImages()}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>


      <AlertDialog open={confirmAddAlias} onOpenChange={setConfirmAddAlias}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Add Alias</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to add the alias <strong>"{newAlias}"</strong> to{" "}
              <strong>
                {selectedType?.manufacturer} {selectedType?.model}
              </strong>
              . This action will be logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAddAlias}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
