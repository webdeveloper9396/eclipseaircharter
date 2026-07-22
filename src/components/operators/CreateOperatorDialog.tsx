import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useOperatorCreate } from "@/hooks/useExternalMutations";
import type { InventoryMode } from "@/integrations/external-supabase/types";
import { Plus } from "lucide-react";

const INVENTORY_MODE_OPTIONS: { value: InventoryMode; label: string }[] = [
  { value: "unclassified", label: "Unclassified" },
  { value: "snapshot", label: "Snapshot" },
  { value: "trusted_small_snapshot", label: "Trusted (small snapshots)" },
  { value: "drop", label: "Drop" },
];

interface CreateOperatorDialogProps {
  onCreated?: (operatorId: string) => void;
}

export function CreateOperatorDialog({ onCreated }: CreateOperatorDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emailAddresses, setEmailAddresses] = useState("");
  const [inventoryMode, setInventoryMode] = useState<InventoryMode>("unclassified");
  const [defaultCurrency, setDefaultCurrency] = useState("");
  const [verified, setVerified] = useState(false);
  const [notes, setNotes] = useState("");
  const [llmInstructions, setLlmInstructions] = useState("");

  const { toast } = useToast();
  const navigate = useNavigate();
  const createOperator = useOperatorCreate();

  const resetForm = () => {
    setName("");
    setEmailAddresses("");
    setInventoryMode("unclassified");
    setDefaultCurrency("");
    setVerified(false);
    setNotes("");
    setLlmInstructions("");
  };

  const handleSubmit = () => {
    // Validate required fields
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!emailAddresses.trim()) {
      toast({ title: "At least one email address is required", variant: "destructive" });
      return;
    }

    // Parse email addresses (comma or newline separated)
    const emails = emailAddresses
      .split(/[,\n]/)
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    if (emails.length === 0) {
      toast({ title: "At least one valid email address is required", variant: "destructive" });
      return;
    }

    createOperator.mutate(
      {
        p_name: name.trim(),
        p_email_addresses: emails,
        p_inventory_mode: inventoryMode,
        p_default_currency: defaultCurrency.trim().toUpperCase() || null,
        p_verified: verified,
        p_notes: notes.trim() || null,
        p_llm_instructions: llmInstructions.trim() || null,
      },
      {
        onSuccess: (data) => {
          toast({ title: "Operator created", description: `${name} has been created.` });
          setOpen(false);
          resetForm();
          if (onCreated && data?.id) {
            onCreated(data.id);
          }
        },
        onError: (err) => {
          toast({
            title: "Failed to create operator",
            description: err.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-secondary border-border">
          <Plus className="h-4 w-4 mr-2" />
          Create Operator
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Operator</DialogTitle>
          <DialogDescription>
            Add a new operator to the system. Required fields are marked with *.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="Operator name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-background border-border"
            />
          </div>

          {/* Email Addresses */}
          <div className="space-y-2">
            <Label htmlFor="emails">Email Addresses * (one per line or comma-separated)</Label>
            <Textarea
              id="emails"
              placeholder="operator@example.com"
              value={emailAddresses}
              onChange={(e) => setEmailAddresses(e.target.value)}
              className="bg-background border-border min-h-[80px]"
            />
          </div>

          {/* Inventory Mode */}
          <div className="space-y-2">
            <Label>Inventory Mode *</Label>
            <Select value={inventoryMode} onValueChange={(v) => setInventoryMode(v as InventoryMode)}>
              <SelectTrigger className="bg-background border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {INVENTORY_MODE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Default Currency */}
          <div className="space-y-2">
            <Label htmlFor="currency">Default Currency</Label>
            <Input
              id="currency"
              placeholder="USD"
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value.toUpperCase())}
              className="bg-background border-border w-24 font-mono uppercase"
              maxLength={3}
            />
          </div>

          {/* Verified */}
          <div className="flex items-center justify-between">
            <Label htmlFor="verified">Verified</Label>
            <Switch id="verified" checked={verified} onCheckedChange={setVerified} />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Optional notes about this operator..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-background border-border"
            />
          </div>

          {/* LLM Instructions */}
          <div className="space-y-2">
            <Label htmlFor="llm">LLM Instructions</Label>
            <Textarea
              id="llm"
              placeholder="Optional instructions for LLM processing..."
              value={llmInstructions}
              onChange={(e) => setLlmInstructions(e.target.value)}
              className="bg-background border-border"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createOperator.isPending}>
            {createOperator.isPending ? "Creating..." : "Create Operator"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
