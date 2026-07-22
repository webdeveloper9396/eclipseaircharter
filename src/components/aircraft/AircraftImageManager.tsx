import { useState, useRef, useCallback, useEffect } from "react";
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { ImageIcon, Upload, Trash2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAircraftTypeSetImages } from "@/hooks/useExternalMutations";
import type { AircraftTypeImages } from "@/hooks/useExternalData";

// External Supabase project base for public storage URLs
const EXTERNAL_STORAGE_BASE =
  "https://zhjkexhurxafsurnsetw.supabase.co/storage/v1/object/public/aircraft-type-images/";

function getPublicUrl(path: string | null): string | null {
  if (!path) return null;
  return EXTERNAL_STORAGE_BASE + path;
}

// Fixed 16:9 crop aspect ratio
const ASPECT = 16 / 9;

function centerAspectCrop(mediaWidth: number, mediaHeight: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 90 }, ASPECT, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight
  );
}

async function getCroppedBlob(
  image: HTMLImageElement,
  crop: PixelCrop,
  maxWidth = 1200
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  const srcWidth = crop.width * scaleX;
  const srcHeight = crop.height * scaleY;

  // Scale down if needed, maintain aspect ratio
  let outWidth = srcWidth;
  let outHeight = srcHeight;
  if (outWidth > maxWidth) {
    const ratio = maxWidth / outWidth;
    outWidth = maxWidth;
    outHeight = Math.round(outHeight * ratio);
  }

  canvas.width = outWidth;
  canvas.height = outHeight;

  const ctx = canvas.getContext("2d")!;
  // Fill white background to prevent black borders when exporting as JPEG
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, outWidth, outHeight);
  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    srcWidth,
    srcHeight,
    0,
    0,
    outWidth,
    outHeight
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas export failed"));
      },
      "image/jpeg",
      0.88
    );
  });
}

interface ImageSlotProps {
  label: string;
  slot: "exterior" | "interior";
  imagePath: string | null;
  aircraftTypeId: string;
  onUpdated: () => void;
}

function ImageSlot({ label, slot, imagePath, aircraftTypeId, onUpdated }: ImageSlotProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const setImagesMutation = useAircraftTypeSetImages();

  // Cropper state
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [srcImage, setSrcImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [imgLoadError, setImgLoadError] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const publicUrl = getPublicUrl(imagePath);

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset file input so same file can be re-selected
    e.target.value = "";

    const reader = new FileReader();
    reader.onload = () => {
      setSrcImage(reader.result as string);
      setCrop(undefined);
      setCompletedCrop(null);
      setCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height));
  }, []);

  const handleSaveCrop = useCallback(async () => {
    if (!completedCrop || !imgRef.current) {
      toast({ title: "No crop selected", description: "Please adjust the crop area.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const blob = await getCroppedBlob(imgRef.current, completedCrop);

      // Get JWT for edge function call
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const formData = new FormData();
      formData.append("file", blob, `${slot}.jpg`);
      formData.append("aircraft_type_id", aircraftTypeId);
      formData.append("slot", slot);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/aircraft-image-upload`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok && response.status !== 207) {
        throw new Error(result.error || "Upload failed");
      }

      if (response.status === 207) {
        // Uploaded to storage but DB update failed
        toast({
          title: "Upload succeeded, DB update failed",
          description: result.error + " Please try again.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Image saved", description: `${label} image updated.` });
        queryClient.invalidateQueries({
          queryKey: ["external", "aircraft_type_images", aircraftTypeId],
        });
        setImgLoadError(false);
        onUpdated();
        setCropDialogOpen(false);
      }
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  }, [completedCrop, aircraftTypeId, slot, label, toast, queryClient, onUpdated]);

  const handleRemove = useCallback(async () => {
    // We need to know the other slot's current value to preserve it.
    // The parent passes imagePath for this slot; the other slot's path
    // is passed via onUpdated+refetch. We'll call the RPC with null for
    // this slot and let the edge function / proxy preserve the other.
    // Since we go through the admin proxy (JSON RPC), we need BOTH values.
    // We call admin_aircraft_type_set_images with null for this slot.
    // The proxy preserves the other slot by fetching it in the edge fn.
    // However for the REMOVE path we go through the existing proxy which
    // does not fetch current values. So we pass null only for the removed
    // slot and rely on the parent to supply the other slot's current value.
    // The parent (AircraftImageManager) handles this.
    onUpdated(); // signal parent to handle removal with full context
  }, [onUpdated]);

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>

      {/* Preview */}
      <div className="relative w-full aspect-video rounded-md overflow-hidden bg-muted/40 border border-border">
        {publicUrl && !imgLoadError ? (
          <img
            src={publicUrl}
            alt={`${label} image`}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={() => setImgLoadError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
            <span className="text-xs text-muted-foreground/50">No image</span>
          </div>
        )}
      </div>

      {imagePath && (
        <p className="text-xs font-mono text-muted-foreground truncate">{imagePath}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 bg-secondary border-border"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          {imagePath ? "Replace" : "Upload"}
        </Button>

        {imagePath && (
          <ConfirmDialog
            trigger={
              <Button
                size="sm"
                variant="outline"
                className="bg-secondary border-border text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            }
            title={`Remove ${label} Image`}
            description={`This will clear the ${label.toLowerCase()} image path in the database. The file will remain in storage.`}
            confirmLabel="Remove"
            dangerous
            onConfirm={handleRemove}
          />
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Crop dialog */}
      <Dialog open={cropDialogOpen} onOpenChange={(open) => { if (!isUploading) setCropDialogOpen(open); }}>
        <DialogContent className="max-w-2xl bg-card border-border">
          <DialogHeader>
            <DialogTitle>Crop {label} Image</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center max-h-[60vh] overflow-auto">
            {srcImage && (
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={ASPECT}
                minWidth={80}
              >
                <img
                  ref={imgRef}
                  src={srcImage}
                  alt="Crop preview"
                  onLoad={handleImageLoad}
                  style={{ maxHeight: "55vh", maxWidth: "100%" }}
                />
              </ReactCrop>
            )}
          </div>
          <p className="text-xs text-muted-foreground text-center">16:9 ratio · drag to reposition · scroll to zoom</p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCropDialogOpen(false)}
              disabled={isUploading}
              className="bg-secondary border-border"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveCrop}
              disabled={isUploading || !completedCrop}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading…
                </>
              ) : (
                "Save & Upload"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface AircraftImageManagerProps {
  aircraftTypeId: string;
  images: AircraftTypeImages | null;
  onUpdated: () => void;
}

export function AircraftImageManager({ aircraftTypeId, images, onUpdated }: AircraftImageManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const setImagesMutation = useAircraftTypeSetImages();

  const handleRemoveSlot = useCallback(
    async (slot: "exterior" | "interior") => {
      const newExterior = slot === "exterior" ? null : (images?.exterior_image_path ?? null);
      const newInterior = slot === "interior" ? null : (images?.interior_image_path ?? null);

      try {
        await setImagesMutation.mutateAsync({
          p_aircraft_type_id: aircraftTypeId,
          p_exterior_image_path: newExterior,
          p_interior_image_path: newInterior,
        });
        toast({ title: "Image removed" });
        queryClient.invalidateQueries({
          queryKey: ["external", "aircraft_type_images", aircraftTypeId],
        });
        queryClient.invalidateQueries({
          queryKey: ["external", "aircraft_type_images_all"],
        });
        onUpdated();
      } catch (err) {
        toast({
          title: "Failed to remove image",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    },
    [aircraftTypeId, images, setImagesMutation, toast, queryClient, onUpdated]
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <SlotWithRemove
        label="Exterior"
        slot="exterior"
        imagePath={images?.exterior_image_path ?? null}
        aircraftTypeId={aircraftTypeId}
        onRemove={() => handleRemoveSlot("exterior")}
        onUploaded={onUpdated}
      />
      <SlotWithRemove
        label="Interior"
        slot="interior"
        imagePath={images?.interior_image_path ?? null}
        aircraftTypeId={aircraftTypeId}
        onRemove={() => handleRemoveSlot("interior")}
        onUploaded={onUpdated}
      />
    </div>
  );
}

// Wrapper that splits "remove" from "upload" callbacks
function SlotWithRemove({
  label,
  slot,
  imagePath,
  aircraftTypeId,
  onRemove,
  onUploaded,
}: {
  label: string;
  slot: "exterior" | "interior";
  imagePath: string | null;
  aircraftTypeId: string;
  onRemove: () => void;
  onUploaded: () => void;
}) {
  // ImageSlot calls onUpdated for both upload success AND remove intent.
  // We distinguish by checking if it was the remove button (passed via ConfirmDialog).
  // Actually the cleanest approach: give ImageSlot separate callbacks.
  return (
    <ImageSlotDirect
      label={label}
      slot={slot}
      imagePath={imagePath}
      aircraftTypeId={aircraftTypeId}
      onRemove={onRemove}
      onUploaded={onUploaded}
    />
  );
}

// Clean version with separate callbacks
function ImageSlotDirect({
  label,
  slot,
  imagePath,
  aircraftTypeId,
  onRemove,
  onUploaded,
}: {
  label: string;
  slot: "exterior" | "interior";
  imagePath: string | null;
  aircraftTypeId: string;
  onRemove: () => void;
  onUploaded: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [srcImage, setSrcImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [imgLoadError, setImgLoadError] = useState(false);
  // Cache-busting: use Date.now() so each mount gets a fresh value
  const [cacheVersion, setCacheVersion] = useState(() => Date.now());

  // Reset error state and bust cache when imagePath changes
  useEffect(() => {
    setImgLoadError(false);
    setCacheVersion(Date.now());
  }, [imagePath]);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const rawUrl = getPublicUrl(imagePath);
  const publicUrl = rawUrl ? `${rawUrl}?v=${cacheVersion}` : null;

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = () => {
      setSrcImage(reader.result as string);
      setCrop(undefined);
      setCompletedCrop(null);
      setCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height));
  };

  const handleSaveCrop = async () => {
    if (!completedCrop || !imgRef.current) {
      toast({ title: "No crop selected", description: "Please adjust the crop area.", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const blob = await getCroppedBlob(imgRef.current, completedCrop);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const formData = new FormData();
      formData.append("file", blob, `${slot}.jpg`);
      formData.append("aircraft_type_id", aircraftTypeId);
      formData.append("slot", slot);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(
        `${supabaseUrl}/functions/v1/aircraft-image-upload`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok && response.status !== 207) {
        throw new Error(result.error || "Upload failed");
      }

      if (response.status === 207) {
        toast({
          title: "Upload succeeded, DB update failed",
          description: result.error + " Please try again.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Image saved", description: `${label} image updated.` });
        queryClient.invalidateQueries({
          queryKey: ["external", "aircraft_type_images", aircraftTypeId],
        });
        queryClient.invalidateQueries({
          queryKey: ["external", "aircraft_type_images_all"],
        });
        setCacheVersion(Date.now());
        setImgLoadError(false);
        setCropDialogOpen(false);
        onUploaded();
      }
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>

      {/* Preview */}
      <div className="relative w-full aspect-video rounded-md overflow-hidden bg-muted/40 border border-border">
        {publicUrl && !imgLoadError ? (
          <img
            src={publicUrl}
            alt={`${label} image`}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={() => setImgLoadError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
            <span className="text-xs text-muted-foreground/50">No image</span>
          </div>
        )}
      </div>

      {imagePath && (
        <p className="text-xs font-mono text-muted-foreground truncate" title={imagePath}>{imagePath}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 bg-secondary border-border"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          {imagePath ? "Replace" : "Upload"}
        </Button>

        {imagePath && (
          <ConfirmDialog
            trigger={
              <Button
                size="sm"
                variant="outline"
                className="bg-secondary border-border text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            }
            title={`Remove ${label} Image`}
            description={`This will clear the ${label.toLowerCase()} image path in the database. The file will remain in storage.`}
            confirmLabel="Remove"
            dangerous
            onConfirm={onRemove}
          />
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Crop dialog */}
      <Dialog
        open={cropDialogOpen}
        onOpenChange={(open) => { if (!isUploading) setCropDialogOpen(open); }}
      >
        <DialogContent className="max-w-2xl bg-card border-border">
          <DialogHeader>
            <DialogTitle>Crop {label} Image</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center max-h-[60vh] overflow-auto">
            {srcImage && (
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
                aspect={ASPECT}
                minWidth={80}
              >
                <img
                  ref={imgRef}
                  src={srcImage}
                  alt="Crop preview"
                  onLoad={handleImageLoad}
                  style={{ maxHeight: "55vh", maxWidth: "100%" }}
                />
              </ReactCrop>
            )}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            16:9 aspect ratio · drag handles to crop
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCropDialogOpen(false)}
              disabled={isUploading}
              className="bg-secondary border-border"
            >
              Cancel
            </Button>
            <Button onClick={handleSaveCrop} disabled={isUploading || !completedCrop}>
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading…
                </>
              ) : (
                "Save & Upload"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
