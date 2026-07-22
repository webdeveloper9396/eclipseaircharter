import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useAdminUpsertAirport, AdminUpsertAirportParams } from "@/hooks/useAdminAirports";
import { useToast } from "@/hooks/use-toast";
import type { Airport } from "@/integrations/external-supabase/types";
import { Plane, Save, RotateCcw, Plus } from "lucide-react";

const airportFormSchema = z.object({
  icao: z
    .string()
    .min(4, "ICAO must be exactly 4 characters")
    .max(4, "ICAO must be exactly 4 characters")
    .regex(/^[A-Z0-9]+$/, "ICAO must be uppercase alphanumeric")
    .transform((v) => v.toUpperCase()),
  iata: z
    .string()
    .max(3, "IATA must be at most 3 characters")
    .regex(/^[A-Z0-9]*$/, "IATA must be uppercase alphanumeric")
    .transform((v) => v.toUpperCase())
    .optional()
    .or(z.literal("")),
  name: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  state: z.string().optional().or(z.literal("")),
  country: z.string().optional().or(z.literal("")),
  latitude: z
    .union([z.string(), z.number(), z.undefined()])
    .optional()
    .transform((v) => {
      if (v === "" || v === undefined || v === null) return null;
      const num = typeof v === "number" ? v : parseFloat(v as string);
      return isNaN(num) ? null : num;
    })
    .refine((v) => v === null || (v >= -90 && v <= 90), {
      message: "Latitude must be between -90 and 90",
    }),
  longitude: z
    .union([z.string(), z.number(), z.undefined()])
    .optional()
    .transform((v) => {
      if (v === "" || v === undefined || v === null) return null;
      const num = typeof v === "number" ? v : parseFloat(v as string);
      return isNaN(num) ? null : num;
    })
    .refine((v) => v === null || (v >= -180 && v <= 180), {
      message: "Longitude must be between -180 and 180",
    }),
  admin_rank: z
    .union([z.string(), z.number(), z.undefined()])
    .optional()
    .transform((v) => {
      if (v === "" || v === undefined || v === null) return null;
      const num = typeof v === "number" ? v : parseInt(v as string, 10);
      return isNaN(num) ? null : num;
    }),
  admin_exclude_from_search: z.boolean().default(false),
  search_city_override: z.string().optional().or(z.literal("")),
});

type AirportFormValues = z.infer<typeof airportFormSchema>;

interface AirportEditPanelProps {
  airport: Airport | null;
  isCreateMode: boolean;
  onSaved: (icao: string) => void;
  onCancel: () => void;
}

export function AirportEditPanel({
  airport,
  isCreateMode,
  onSaved,
  onCancel,
}: AirportEditPanelProps) {
  const { toast } = useToast();
  const upsertMutation = useAdminUpsertAirport();

  const form = useForm<AirportFormValues>({
    resolver: zodResolver(airportFormSchema),
    defaultValues: {
      icao: "",
      iata: "",
      name: "",
      city: "",
      state: "",
      country: "",
      latitude: undefined,
      longitude: undefined,
      admin_rank: undefined,
      admin_exclude_from_search: false,
      search_city_override: "",
    },
  });

  // Reset form when airport changes
  useEffect(() => {
    if (airport) {
      form.reset({
        icao: airport.icao || "",
        iata: airport.iata || "",
        name: airport.name || "",
        city: airport.city || "",
        state: airport.state || "",
        country: airport.country || "",
        latitude: airport.latitude ?? undefined,
        longitude: airport.longitude ?? undefined,
        admin_rank: airport.admin_rank ?? undefined,
        admin_exclude_from_search: airport.admin_exclude_from_search ?? false,
        search_city_override: airport.search_city_override || "",
      });
    } else if (isCreateMode) {
      form.reset({
        icao: "",
        iata: "",
        name: "",
        city: "",
        state: "",
        country: "",
        latitude: undefined,
        longitude: undefined,
        admin_rank: undefined,
        admin_exclude_from_search: false,
        search_city_override: "",
      });
    }
  }, [airport, isCreateMode, form]);

  const onSubmit = async (values: AirportFormValues) => {
    const params: AdminUpsertAirportParams = {
      p_icao: values.icao,
      p_iata: values.iata || null,
      p_name: values.name || null,
      p_city: values.city || null,
      p_state: values.state || null,
      p_country: values.country || null,
      p_latitude: values.latitude,
      p_longitude: values.longitude,
      p_admin_rank: values.admin_rank,
      p_admin_exclude_from_search: values.admin_exclude_from_search,
      p_search_city_override: values.search_city_override || null,
    };

    try {
      await upsertMutation.mutateAsync(params);
      toast({
        title: isCreateMode ? "Airport created" : "Airport saved",
        description: `${values.icao} has been ${isCreateMode ? "created" : "updated"}.`,
      });
      onSaved(values.icao);
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to save airport",
        variant: "destructive",
      });
    }
  };

  const handleReset = () => {
    if (airport) {
      form.reset({
        icao: airport.icao || "",
        iata: airport.iata || "",
        name: airport.name || "",
        city: airport.city || "",
        state: airport.state || "",
        country: airport.country || "",
        latitude: airport.latitude ?? undefined,
        longitude: airport.longitude ?? undefined,
        admin_rank: airport.admin_rank ?? undefined,
        admin_exclude_from_search: airport.admin_exclude_from_search ?? false,
        search_city_override: airport.search_city_override || "",
      });
    }
  };

  if (!airport && !isCreateMode) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground p-8">
        <Plane className="h-12 w-12 mb-4 opacity-30" />
        <p className="text-center">Select an airport from the list to edit, or click "Add Airport" to create a new one.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-lg font-semibold">
          {isCreateMode ? "Create Airport" : `Edit ${airport?.icao || "Airport"}`}
        </h2>
        {airport && !isCreateMode && (
          <p className="text-sm text-muted-foreground mt-1">
            {airport.city || airport.name || "Unknown location"}
          </p>
        )}
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Identity Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Identity
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="icao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ICAO Code *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="KJFK"
                          className="font-mono uppercase bg-secondary border-border"
                          disabled={!isCreateMode}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="iata"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>IATA Code</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="JFK"
                          className="font-mono uppercase bg-secondary border-border"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="John F. Kennedy International Airport"
                        className="bg-secondary border-border"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Location Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Location
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="New York"
                          className="bg-secondary border-border"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="NY"
                          className="bg-secondary border-border"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="US"
                        className="bg-secondary border-border"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="latitude"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Latitude</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="any"
                          placeholder="40.6413"
                          className="bg-secondary border-border"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">-90 to 90</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="longitude"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Longitude</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="any"
                          placeholder="-73.7781"
                          className="bg-secondary border-border"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">-180 to 180</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Admin Settings Section */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Admin Settings
              </h3>

              <FormField
                control={form.control}
                name="admin_rank"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Admin Rank</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        placeholder="e.g., 100"
                        className="bg-secondary border-border"
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Lower ranks appear first in search results
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="admin_exclude_from_search"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Exclude from Search</FormLabel>
                      <FormDescription className="text-xs">
                        When enabled, this airport won't appear in search results
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="search_city_override"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Metro Override</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., New York"
                        className="bg-secondary border-border"
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      Alternative city name for search matching (e.g., "New York" for KTEB)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
      </div>

      {/* Actions Footer */}
      <div className="border-t border-border px-6 py-4 flex gap-2">
        <Button
          onClick={form.handleSubmit(onSubmit)}
          disabled={upsertMutation.isPending}
          className="flex-1"
        >
          {upsertMutation.isPending ? (
            "Saving..."
          ) : isCreateMode ? (
            <>
              <Plus className="h-4 w-4 mr-2" />
              Create Airport
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>

        {!isCreateMode && (
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={upsertMutation.isPending}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={upsertMutation.isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
