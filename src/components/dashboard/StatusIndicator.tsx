import { cn } from "@/lib/utils";

type Status = "active" | "inactive" | "pending" | "error";

interface StatusIndicatorProps {
  status: Status;
  label?: string;
  className?: string;
}

export function StatusIndicator({ status, label, className }: StatusIndicatorProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        className={cn(
          "w-2 h-2 rounded-full",
          status === "active" && "bg-status-success",
          status === "inactive" && "bg-muted-foreground",
          status === "pending" && "bg-status-warning",
          status === "error" && "bg-status-error"
        )}
      />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
