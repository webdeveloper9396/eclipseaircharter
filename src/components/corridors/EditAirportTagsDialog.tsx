import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { adminRpc } from "@/lib/admin-proxy";
import { useQueryClient } from "@tanstack/react-query";
import { X, Plus, Minus } from "lucide-react";
import type { Airport } from "@/integrations/external-supabase/types";

interface EditAirportTagsDialogProps {
  airport: Airport;
  trigger: React.ReactNode;
  onSuccess?: () => void;
}

type Mode = "add" | "remove";

export function EditAirportTagsDialog({
  airport,
  trigger,
  onSuccess,
}: EditAirportTagsDialogProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("add");
  const [tagsInput, setTagsInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const currentTags = airport.corridor_tags || [];
  const airportCode = airport.icao || airport.iata || airport.id;

  const handleSubmit = async () => {
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    if (tags.length === 0) {
      toast({
        title: "No tags provided",
        description: "Enter at least one tag separated by commas.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const rpc = mode === "add" 
        ? "airports_add_corridor_tags_v1" 
        : "airports_remove_corridor_tags_v1";

      await adminRpc(rpc, {
        p_airport_codes: [airportCode],
        p_tags: tags,
      });

      toast({
        title: mode === "add" ? "Tags added" : "Tags removed",
        description: `${tags.join(", ")} ${mode === "add" ? "added to" : "removed from"} ${airportCode}. Action logged.`,
      });

      setTagsInput("");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["external", "airports-search"] });
      queryClient.invalidateQueries({ queryKey: ["external", "derived_corridors"] });
      onSuccess?.();
    } catch (error) {
      toast({
        title: "Error updating tags",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle>Modify Corridor Tags</DialogTitle>
          <DialogDescription>
            Add or remove corridor tags for {airport.icao} ({airport.city || airport.name})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current tags */}
          <div>
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              Current Tags
            </Label>
            <div className="flex gap-2 flex-wrap mt-2 min-h-[32px]">
              {currentTags.length > 0 ? (
                currentTags.map((tag) => (
                  <Badge key={tag} variant="outline" className="bg-badge-muted border-border">
                    {tag}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">No tags assigned</span>
              )}
            </div>
          </div>

          {/* Mode toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === "add" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("add")}
              className="flex-1"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Tags
            </Button>
            <Button
              type="button"
              variant={mode === "remove" ? "destructive" : "outline"}
              size="sm"
              onClick={() => setMode("remove")}
              className="flex-1"
            >
              <Minus className="h-4 w-4 mr-1" />
              Remove Tags
            </Button>
          </div>

          {/* Tag input */}
          <div>
            <Label htmlFor="tags-input" className="text-sm">
              {mode === "add" ? "Tags to Add" : "Tags to Remove"}
            </Label>
            <Input
              id="tags-input"
              placeholder="e.g., NYC, FLORIDA, NORTHEAST"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="mt-1 bg-secondary border-border"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Comma-separated. Tags will be normalized to uppercase.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="bg-secondary border-border"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !tagsInput.trim()}
            variant={mode === "remove" ? "destructive" : "default"}
          >
            {isSubmitting ? "Saving..." : mode === "add" ? "Add Tags" : "Remove Tags"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
