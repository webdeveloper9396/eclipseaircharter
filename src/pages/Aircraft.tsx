import { useState, useMemo } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { DataTable } from "@/components/dashboard/DataTable";
import { FilterBar } from "@/components/dashboard/FilterBar";
import { useAircraftCategories, useAircraftTypes, useAllAircraftTypeImages } from "@/hooks/useExternalData";
import type { AircraftType } from "@/integrations/external-supabase/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusIndicator } from "@/components/dashboard/StatusIndicator";
import { CreateAircraftTypeDialog } from "@/components/aircraft/CreateAircraftTypeDialog";
import { AircraftTypeDetailSheet } from "@/components/aircraft/AircraftTypeDetailSheet";
import { getCategorySeatRange } from "@/lib/aircraft-utils";
import { Input } from "@/components/ui/input";
import { Search, Image, ImageOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function ImageIndicator({ path }: { path: string | null | undefined }) {
  const has = !!path;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center justify-center">
          {has ? (
            <Image className="w-4 h-4 text-emerald-500" />
          ) : (
            <ImageOff className="w-4 h-4 text-muted-foreground/30" />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>{has ? "Image uploaded" : "No image"}</TooltipContent>
    </Tooltip>
  );
}

export default function Aircraft() {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");
  const [selectedType, setSelectedType] = useState<AircraftType | null>(null);

  const { data: categories, isLoading: categoriesLoading } = useAircraftCategories();
  const { data: types, isLoading: typesLoading, error } = useAircraftTypes();
  const { data: allImages } = useAllAircraftTypeImages();

  // Build a fast lookup map: aircraft_type_id -> image row
  const imageMap = useMemo(
    () => new Map((allImages || []).map((img) => [img.aircraft_type_id, img])),
    [allImages]
  );

  // Create category lookup map
  const categoryMap = new Map((categories || []).map(cat => [cat.id, cat.display_name]));
  
  const formatCategoryId = (categoryId: string | null) => {
    if (!categoryId) return "—";
    const catName = categoryMap.get(categoryId);
    if (catName) return catName;
    return categoryId.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const filteredTypes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (types || []).filter((type) => {
      if (categoryFilter !== "all" && type.category_id !== categoryFilter) return false;
      if (q) {
        const hay = `${type.manufacturer} ${type.model}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [types, categoryFilter, search]);

  const columns = [
    {
      key: "manufacturer",
      header: "Manufacturer",
      render: (type: AircraftType) => (
        <span className="font-medium">{type.manufacturer}</span>
      ),
    },
    {
      key: "model",
      header: "Model",
      render: (type: AircraftType) => type.model,
    },
    {
      key: "category_name",
      header: "Category",
      render: (type: AircraftType) => {
        const seatRange = getCategorySeatRange(type.category_id);
        return (
          <span className="flex items-center gap-2">
            <Badge variant="outline" className="bg-badge-muted border-border font-normal">
              {formatCategoryId(type.category_id)}
            </Badge>
            {seatRange && <span className="text-xs text-muted-foreground">({seatRange})</span>}
          </span>
        );
      },
    },
    {
      key: "exterior_img",
      header: "Ext",
      className: "w-12 text-center",
      render: (type: AircraftType) => (
        <ImageIndicator path={imageMap.get(type.id)?.exterior_image_path} />
      ),
    },
    {
      key: "interior_img",
      header: "Int",
      className: "w-12 text-center",
      render: (type: AircraftType) => (
        <ImageIndicator path={imageMap.get(type.id)?.interior_image_path} />
      ),
    },
    {
      key: "active",
      header: "Status",
      render: (type: AircraftType) => (
        <StatusIndicator
          status={type.active ? "active" : "inactive"}
          label={type.active ? "Active" : "Inactive"}
        />
      ),
    },
  ];

  if (error) {
    return (
      <DashboardLayout>
        <PageHeader title="Aircraft" description="Error loading aircraft" />
        <div className="bg-destructive/10 border border-destructive rounded-md p-4">
          <p className="text-destructive">Failed to load aircraft: {error.message}</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title="Aircraft"
        description="Manage aircraft categories, types, and alias mappings"
      />

      <Tabs defaultValue="types" className="mb-6">
        <TabsList className="bg-secondary border-border">
          <TabsTrigger value="types">Aircraft Types</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="types" className="mt-4">
          <FilterBar>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px] bg-secondary border-border">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="all">All Categories</SelectItem>
                {(categories || []).map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search by manufacturer or model…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 bg-secondary border-border h-9"
              />
            </div>
            <div className="flex-1" />
            <CreateAircraftTypeDialog categories={categories || []} />
          </FilterBar>

          {typesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <DataTable<AircraftType>
              columns={columns}
              data={filteredTypes}
              keyExtractor={(type) => type.id}
              onRowClick={(type) => setSelectedType(type)}
              emptyMessage="No aircraft types found"
            />
          )}
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          {categoriesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="bg-tile border border-tile-border rounded-md">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider">
                      Category
                    </th>
                    <th className="text-right px-4 py-3 text-xs text-muted-foreground uppercase tracking-wider">
                      Display Order
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(categories || []).map((cat) => (
                    <tr key={cat.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium">
                        {cat.display_name}
                        {(() => {
                          const seatRange = getCategorySeatRange(cat.id);
                          return seatRange ? <span className="text-muted-foreground font-normal ml-2 text-xs">({seatRange})</span> : null;
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {cat.sort_order ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Categories are read-only. Contact system administrator to modify.
          </p>
        </TabsContent>
      </Tabs>

      <AircraftTypeDetailSheet
        selectedType={selectedType}
        onClose={() => setSelectedType(null)}
        categories={categories || []}
      />
    </DashboardLayout>
  );
}
