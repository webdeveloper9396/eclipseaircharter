import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useAircraftTypeCreate } from "@/hooks/useExternalMutations";
import { useToast } from "@/hooks/use-toast";
import type { AircraftCategory } from "@/integrations/external-supabase/types";

interface CreateAircraftTypeDialogProps {
  categories: AircraftCategory[];
}

export function CreateAircraftTypeDialog({ categories }: CreateAircraftTypeDialogProps) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [icaoTypeCode, setIcaoTypeCode] = useState("");
  const [active, setActive] = useState(true);
  const { toast } = useToast();
  const createMutation = useAircraftTypeCreate();

  const resetForm = () => {
    setManufacturer("");
    setModel("");
    setCategoryId("");
    setIcaoTypeCode("");
    setActive(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!model.trim()) {
      toast({
        title: "Validation Error",
        description: "Model is required.",
        variant: "destructive",
      });
      return;
    }
    if (!categoryId) {
      toast({
        title: "Validation Error",
        description: "Please select a category.",
        variant: "destructive",
      });
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    try {
      await createMutation.mutateAsync({
        p_manufacturer: manufacturer.trim() || undefined,
        p_model: model.trim(),
        p_category_id: categoryId,
        p_icao_type_code: icaoTypeCode.trim() || undefined,
        p_active: active,
      });
      toast({
        title: "Aircraft type created",
        description: `${manufacturer ? manufacturer + " " : ""}${model} has been created.`,
      });
      resetForm();
      setOpen(false);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : String(error);
      
      // Check for duplicate model_norm error
      if (errorMessage.includes('already exists') || errorMessage.includes('model_norm')) {
        toast({
          title: "Duplicate Aircraft Type",
          description: "An aircraft type with this model already exists (normalized names conflict).",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error creating aircraft type",
          description: errorMessage,
          variant: "destructive",
        });
      }
    }
    setConfirmOpen(false);
  };

  const selectedCategory = categories.find(c => c.id === categoryId);

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) resetForm();
      }}>
        <DialogTrigger asChild>
          <Button variant="outline" className="bg-secondary border-border">
            <Plus className="h-4 w-4 mr-2" />
            Add Aircraft Type
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Create Aircraft Type</DialogTitle>
            <DialogDescription>
              Add a new canonical aircraft type to the system.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="manufacturer">Manufacturer</Label>
                <Input
                  id="manufacturer"
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  placeholder="e.g., Gulfstream"
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model *</Label>
                <Input
                  id="model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g., G650"
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category *</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {categories
                      .slice()
                      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                      .map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.display_name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="icaoTypeCode">ICAO Type Code</Label>
                <Input
                  id="icaoTypeCode"
                  value={icaoTypeCode}
                  onChange={(e) => setIcaoTypeCode(e.target.value.toUpperCase())}
                  placeholder="e.g., GLF6"
                  maxLength={4}
                  className="bg-secondary border-border font-mono"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="active">Active</Label>
                <Switch
                  id="active"
                  checked={active}
                  onCheckedChange={setActive}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Aircraft Type Creation</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to create a new aircraft type:
              <br />
              <strong>{manufacturer ? `${manufacturer} ` : ""}{model}</strong>
              {selectedCategory && (
                <> in category <strong>{selectedCategory.display_name}</strong></>
              )}
              {icaoTypeCode && (
                <> with ICAO code <strong>{icaoTypeCode}</strong></>
              )}
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
