import type { CorridorValidationIssue } from "@/integrations/external-supabase/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from "lucide-react";

interface ValidationResultsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issues: CorridorValidationIssue[];
  isLoading?: boolean;
}

export function ValidationResultsDialog({
  open,
  onOpenChange,
  issues,
  isLoading,
}: ValidationResultsDialogProps) {
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warnCount = issues.filter(i => i.severity === 'warn').length;
  const infoCount = issues.filter(i => i.severity === 'info').length;

  const getSeverityIcon = (severity: CorridorValidationIssue['severity']) => {
    switch (severity) {
      case 'error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'warn':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityBadgeVariant = (severity: CorridorValidationIssue['severity']) => {
    switch (severity) {
      case 'error':
        return 'destructive';
      case 'warn':
        return 'secondary';
      case 'info':
        return 'outline';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Corridor Validation Results
          </DialogTitle>
          <DialogDescription>
            {isLoading ? (
              "Running validation..."
            ) : issues.length === 0 ? (
              <span className="flex items-center gap-2 text-green-500">
                <CheckCircle2 className="h-4 w-4" />
                All corridors passed validation!
              </span>
            ) : (
              <span className="flex items-center gap-2">
                Found {issues.length} issue{issues.length !== 1 ? 's' : ''}:
                {errorCount > 0 && (
                  <Badge variant="destructive" className="text-xs">{errorCount} error{errorCount !== 1 ? 's' : ''}</Badge>
                )}
                {warnCount > 0 && (
                  <Badge variant="secondary" className="text-xs">{warnCount} warning{warnCount !== 1 ? 's' : ''}</Badge>
                )}
                {infoCount > 0 && (
                  <Badge variant="outline" className="text-xs">{infoCount} info</Badge>
                )}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {!isLoading && issues.length > 0 && (
          <ScrollArea className="max-h-[400px] mt-4">
            <div className="space-y-3">
              {issues.map((issue, index) => (
                <div
                  key={index}
                  className="flex gap-3 p-3 rounded-md bg-secondary border border-border"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {getSeverityIcon(issue.severity)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={getSeverityBadgeVariant(issue.severity) as "destructive" | "secondary" | "outline"} className="text-xs uppercase">
                        {issue.severity}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium">{issue.issue}</p>
                    {issue.details && (
                      <p className="text-sm text-muted-foreground mt-1">{issue.details}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
