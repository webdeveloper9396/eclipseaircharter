import { useState, useEffect, useMemo } from "react";
import type { CorridorSummary, CorridorPurpose } from "@/integrations/external-supabase/types";
import { useCorridorUpsertV2, useExpansionCorridors } from "@/hooks/useCorridors";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CorridorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  corridor?: CorridorSummary | null; // null = create mode, object = edit mode
  onSuccess?: () => void;
}

export function CorridorFormDialog({
  open,
  onOpenChange,
  corridor,
  onSuccess,
}: CorridorFormDialogProps) {
  const isEditing = !!corridor;
  const { toast } = useToast();
  
  // Form state
  const [id, setId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [purpose, setPurpose] = useState<CorridorPurpose>("expansion");
  const [userSelectable, setUserSelectable] = useState(false);
  const [expansionParentId, setExpansionParentId] = useState<string>("");
  const [pickerRank, setPickerRank] = useState("");
  const [synonymsInput, setSynonymsInput] = useState("");
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [slug, setSlug] = useState("");
  const [active, setActive] = useState(true);

  const upsertMutation = useCorridorUpsertV2();
  const { data: parentOptions } = useExpansionCorridors(corridor?.id);

  // Reset form when dialog opens or corridor changes
  useEffect(() => {
    if (open) {
      if (corridor) {
        setId(corridor.id);
        setDisplayName(corridor.display_name);
        setPurpose(corridor.purpose);
        setUserSelectable(corridor.user_selectable);
        setExpansionParentId(corridor.expansion_parent_id || "");
        setPickerRank(corridor.picker_rank !== null ? String(corridor.picker_rank) : "");
        setSynonyms(corridor.synonyms || []);
        setSynonymsInput("");
        setNotes(corridor.notes || "");
        setSlug(corridor.slug || "");
        setActive(corridor.active);
      } else {
        // Create mode - reset all
        setId("");
        setDisplayName("");
        setPurpose("expansion");
        setUserSelectable(false);
        setExpansionParentId("");
        setPickerRank("");
        setSynonyms([]);
        setSynonymsInput("");
        setNotes("");
        setSlug("");
        setActive(true);
      }
    }
  }, [open, corridor]);

  // Normalize ID to UPPER_SNAKE_CASE
  const normalizedId = useMemo(() => {
    return id.trim().toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
  }, [id]);

  const handleAddSynonym = () => {
    const trimmed = synonymsInput.trim();
    if (trimmed && !synonyms.includes(trimmed)) {
      setSynonyms([...synonyms, trimmed]);
      setSynonymsInput("");
    }
  };

  const handleRemoveSynonym = (syn: string) => {
    setSynonyms(synonyms.filter(s => s !== syn));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddSynonym();
    }
  };

  const handleSubmit = async () => {
    if (!normalizedId) {
      toast({
        title: "ID required",
        description: "Enter an ID for the corridor (UPPER_SNAKE_CASE).",
        variant: "destructive",
      });
      return;
    }

    if (!displayName.trim()) {
      toast({
        title: "Display name required",
        description: "Enter a display name for the corridor.",
        variant: "destructive",
      });
      return;
    }

    try {
      await upsertMutation.mutateAsync({
        p_id: normalizedId,
        p_display_name: displayName.trim(),
        p_purpose: purpose,
        p_user_selectable: purpose === 'expansion' ? userSelectable : false,
        p_expansion_parent_id: purpose === 'expansion' && expansionParentId ? expansionParentId : null,
        p_picker_rank: pickerRank ? parseInt(pickerRank, 10) : null,
        p_synonyms: synonyms.length > 0 ? synonyms : undefined,
        p_notes: notes.trim() || null,
        p_active: active,
        p_slug: slug.trim() || null,
      });

      toast({
        title: isEditing ? "Corridor updated" : "Corridor created",
        description: `${isEditing ? "Updated" : "Created"} corridor "${normalizedId}". Action logged.`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: isEditing ? "Error updating corridor" : "Error creating corridor",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Corridor" : "Create New Corridor"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update corridor settings. Membership is managed separately."
              : "Create a new corridor. Add airports after creation."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* ID */}
          <div className="space-y-2">
            <Label htmlFor="corridor-id">ID (UPPER_SNAKE_CASE)</Label>
            <Input
              id="corridor-id"
              placeholder="e.g., FLORIDA_COAST"
              value={id}
              onChange={(e) => setId(e.target.value)}
              className="bg-secondary border-border font-mono"
              disabled={isEditing}
            />
            {normalizedId && normalizedId !== id && (
              <p className="text-xs text-muted-foreground">
                Will be saved as: <span className="font-mono">{normalizedId}</span>
              </p>
            )}
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="display-name">Display Name</Label>
            <Input
              id="display-name"
              placeholder="e.g., Florida Coast"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="bg-secondary border-border"
            />
          </div>

          {/* Purpose */}
          <div className="space-y-2">
            <Label>Purpose</Label>
            <Select value={purpose} onValueChange={(v) => setPurpose(v as CorridorPurpose)}>
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="expansion">Expansion</SelectItem>
                <SelectItem value="ingestion">Ingestion</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* User Selectable (only for expansion) */}
          {purpose === 'expansion' && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="user-selectable"
                checked={userSelectable}
                onCheckedChange={(checked) => setUserSelectable(!!checked)}
              />
              <Label htmlFor="user-selectable" className="text-sm font-normal">
                User Selectable (visible in search picker)
              </Label>
            </div>
          )}

          {/* Expansion Parent (only for expansion) */}
          {purpose === 'expansion' && (
            <div className="space-y-2">
              <Label>Expansion Parent (optional)</Label>
              <Select 
                value={expansionParentId || "__none__"} 
                onValueChange={(v) => setExpansionParentId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {parentOptions?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Picker Rank */}
          <div className="space-y-2">
            <Label htmlFor="picker-rank">Picker Rank (optional)</Label>
            <Input
              id="picker-rank"
              type="number"
              placeholder="e.g., 10"
              value={pickerRank}
              onChange={(e) => setPickerRank(e.target.value)}
              className="bg-secondary border-border"
              min="0"
            />
            <p className="text-xs text-muted-foreground">
              Lower ranks appear first in search picker.
            </p>
          </div>

          {/* Slug */}
          <div className="space-y-2">
            <Label htmlFor="slug">URL Slug (optional)</Label>
            <Input
              id="slug"
              placeholder="e.g., florida-coast"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="bg-secondary border-border"
            />
          </div>

          {/* Synonyms */}
          <div className="space-y-2">
            <Label>Synonyms</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add synonym and press Enter"
                value={synonymsInput}
                onChange={(e) => setSynonymsInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="bg-secondary border-border flex-1"
              />
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleAddSynonym}
                disabled={!synonymsInput.trim()}
              >
                Add
              </Button>
            </div>
            {synonyms.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-2">
                {synonyms.map((syn) => (
                  <Badge key={syn} variant="secondary" className="gap-1">
                    {syn}
                    <button onClick={() => handleRemoveSynonym(syn)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Internal notes about this corridor..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-secondary border-border"
              rows={2}
            />
          </div>

          {/* Active */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="active"
              checked={active}
              onCheckedChange={(checked) => setActive(!!checked)}
            />
            <Label htmlFor="active" className="text-sm font-normal">
              Active
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-secondary border-border"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={upsertMutation.isPending || !normalizedId || !displayName.trim()}
          >
            {upsertMutation.isPending
              ? isEditing ? "Saving..." : "Creating..."
              : isEditing ? "Save Changes" : "Create Corridor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
