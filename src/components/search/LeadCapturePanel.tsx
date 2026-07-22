import { useState } from "react";
import { ChevronDown, ChevronUp, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export interface LeadData {
  name: string;
  email: string;
  phone: string;
  okToContact: boolean;
}

interface LeadCapturePanelProps {
  lead: LeadData;
  onChange: (lead: LeadData) => void;
}

export function LeadCapturePanel({ lead, onChange }: LeadCapturePanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const updateField = <K extends keyof LeadData>(field: K, value: LeadData[K]) => {
    onChange({ ...lead, [field]: value });
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border border-border bg-card p-4">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div className="text-left">
                <p className="font-medium text-sm">Get updates on matching legs</p>
                <p className="text-xs text-muted-foreground">
                  We'll reach out quickly to confirm availability and options
                </p>
              </div>
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="lead-name" className="text-xs">
                Name
              </Label>
              <Input
                id="lead-name"
                placeholder="Your name"
                value={lead.name}
                onChange={(e) => updateField("name", e.target.value)}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lead-email" className="text-xs">
                Email
              </Label>
              <Input
                id="lead-email"
                type="email"
                placeholder="you@example.com"
                value={lead.email}
                onChange={(e) => updateField("email", e.target.value)}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lead-phone" className="text-xs">
                Phone (optional)
              </Label>
              <Input
                id="lead-phone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={lead.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center space-x-2">
            <Checkbox
              id="ok-to-contact"
              checked={lead.okToContact}
              onCheckedChange={(checked) =>
                updateField("okToContact", checked === true)
              }
            />
            <Label htmlFor="ok-to-contact" className="text-xs text-muted-foreground cursor-pointer">
              OK to contact me about matching empty legs
            </Label>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
