import { cn } from "@/lib/utils";

type Severity = "error" | "warn" | "info";

interface SeverityBadgeProps {
  severity: Severity;
  className?: string;
}

export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wider",
        severity === "error" && "bg-severity-error/20 text-severity-error",
        severity === "warn" && "bg-severity-warn/20 text-severity-warn",
        severity === "info" && "bg-severity-info/20 text-severity-info",
        className
      )}
    >
      {severity}
    </span>
  );
}
