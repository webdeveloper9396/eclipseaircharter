import { Loader2 } from "lucide-react";

interface InterpretiveHeaderProps {
  totalResults: number;
  exactCount: number;
  nearbyCount: number;
  isLoadingExpanded: boolean;
}

/**
 * Interpretive header above search results.
 * Communicates the system's judgment rather than raw counts.
 */
export function InterpretiveHeader({
  totalResults,
  exactCount,
  nearbyCount,
  isLoadingExpanded,
}: InterpretiveHeaderProps) {
  // Determine the interpretive message
  const getMessage = (): { heading: string; subtext: string } => {
    if (totalResults === 0) {
      return {
        heading: "",
        subtext: "",
      };
    }

    if (exactCount > 0 && nearbyCount > 0) {
      return {
        heading: "We found availability for your route",
        subtext: `Direct matches on your route, plus options that are often a short reposition.`,
      };
    }

    if (exactCount > 0) {
      return {
        heading: "We found availability for your route",
        subtext: isLoadingExpanded
          ? "Checking for additional options…"
          : "Direct matches on your selected route.",
      };
    }

    // Only nearby/similar results — skip header; the section header handles it
    return {
      heading: "",
      subtext: "",
    };
  };

  const { heading, subtext } = getMessage();

  if (!heading && !subtext) return null;

  return (
    <div className="space-y-1.5 mb-6">
      <h2 className="text-lg font-medium text-foreground tracking-tight" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
        {heading}
      </h2>
      <p className="text-sm text-muted-foreground/80 max-w-lg">
        {subtext}
        {isLoadingExpanded && (
          <span className="inline-flex items-center gap-1.5 ml-2">
            <Loader2 className="h-3 w-3 animate-spin" />
          </span>
        )}
      </p>
    </div>
  );
}
