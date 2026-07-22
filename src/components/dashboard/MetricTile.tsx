import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface MetricTileProps {
  label: string;
  value: number | string;
  sublabel?: string;
  href?: string;
  attention?: boolean;
  icon?: ReactNode;
  className?: string;
}

export function MetricTile({
  label,
  value,
  sublabel,
  href,
  attention = false,
  icon,
  className,
}: MetricTileProps) {
  const content = (
    <div
      className={cn(
        "bg-tile border border-tile-border rounded-md p-4 transition-colors group",
        href && "cursor-pointer hover:bg-secondary hover:border-border",
        attention && "border-accent/30",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
            {label}
          </p>
          <p
            className={cn(
              "text-2xl font-semibold tabular-nums",
              attention && "text-accent"
            )}
          >
            {value}
          </p>
          {sublabel && (
            <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>
          )}
        </div>
        {icon && (
          <div
            className={cn(
              "text-muted-foreground",
              href && "group-hover:text-foreground transition-colors"
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return <Link to={href}>{content}</Link>;
  }

  return content;
}
