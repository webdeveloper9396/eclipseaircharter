import { Pencil, MapPin, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SearchSummaryBarProps {
  originLabel: string;
  destinationLabel: string;
  dateDisplay: string;
  onEdit: () => void;
}

/**
 * Compact summary bar shown after a search executes.
 * Displays route and travel window in a single line.
 */
export function SearchSummaryBar({
  originLabel,
  destinationLabel,
  dateDisplay,
  onEdit,
}: SearchSummaryBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm px-5 py-3 mb-6">
      {/* Route */}
      <div className="flex items-center gap-2 text-sm">
        <MapPin className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="font-medium text-foreground">{originLabel}</span>
        <span className="text-muted-foreground/50">→</span>
        <span className="font-medium text-foreground">{destinationLabel}</span>
      </div>

      <span className="hidden sm:block text-border/60">|</span>

      {/* Dates */}
      <div className="flex items-center gap-2 text-sm">
        <Calendar className="h-3.5 w-3.5 text-muted-foreground/60" />
        <span className="text-foreground/80">{dateDisplay}</span>
      </div>

      {/* Edit action */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onEdit}
        className="ml-auto h-7 text-xs text-muted-foreground hover:text-foreground gap-1.5"
      >
        <Pencil className="h-3 w-3" />
        Edit
      </Button>
    </div>
  );
}
