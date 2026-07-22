import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useCorridors } from "@/hooks/useExternalData";

type PairRow = {
  id: string;
  corridor_a: string;
  corridor_b: string;
  weight: number;
  is_active: boolean;
  sort_order: number;
  _isNew?: boolean;
  _deleted?: boolean;
};

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/** Adjust weight on `targetIdx` to `newVal` and proportionally rescale other ACTIVE rows so total active = 100. */
function rebalanceWeights(rows: PairRow[], targetIdx: number, newVal: number): PairRow[] {
  const clamped = Math.max(0, Math.min(100, newVal));
  const activeIdxs = rows
    .map((r, i) => ({ r, i }))
    .filter((x) => x.r.is_active && !x.r._deleted)
    .map((x) => x.i);

  if (!activeIdxs.includes(targetIdx)) {
    // Target is inactive — just set its weight without rebalance.
    return rows.map((r, i) => (i === targetIdx ? { ...r, weight: clamped } : r));
  }

  const others = activeIdxs.filter((i) => i !== targetIdx);
  const remaining = 100 - clamped;
  const othersSum = others.reduce((s, i) => s + rows[i].weight, 0);

  return rows.map((r, i) => {
    if (i === targetIdx) return { ...r, weight: clamped };
    if (!others.includes(i)) return r;
    if (othersSum <= 0) {
      // Distribute evenly if everyone else is at zero
      return { ...r, weight: others.length ? remaining / others.length : 0 };
    }
    return { ...r, weight: (r.weight / othersSum) * remaining };
  });
}

function normalizeActive(rows: PairRow[]): PairRow[] {
  const active = rows.filter((r) => r.is_active && !r._deleted);
  if (active.length === 0) return rows;
  const equal = 100 / active.length;
  return rows.map((r) => (r.is_active && !r._deleted ? { ...r, weight: equal } : r));
}

export default function FeaturedSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: corridors, isLoading: corridorsLoading } = useCorridors();

  const settingsQuery = useQuery({
    queryKey: ["featured_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("featured_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const pairsQuery = useQuery({
    queryKey: ["featured_corridor_pairs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("featured_corridor_pairs")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as PairRow[];
    },
  });

  const [totalCount, setTotalCount] = useState<number>(15);
  const [rows, setRows] = useState<PairRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settingsQuery.data) setTotalCount(settingsQuery.data.total_count);
  }, [settingsQuery.data]);

  useEffect(() => {
    if (pairsQuery.data) setRows(pairsQuery.data.map((r) => ({ ...r })));
  }, [pairsQuery.data]);

  const corridorMap = useMemo(() => {
    const m: Record<string, string> = {};
    (corridors ?? []).forEach((c: any) => {
      m[c.id] = c.display_name || c.id;
    });
    return m;
  }, [corridors]);

  const corridorLabel = (id: string) => corridorMap[id] || id;

  const visibleRows = rows.filter((r) => !r._deleted);
  const activeRows = visibleRows.filter((r) => r.is_active);
  const activeSum = activeRows.reduce((s, r) => s + r.weight, 0);

  const updateRow = (idx: number, patch: Partial<PairRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleWeightChange = (idx: number, val: number) => {
    setRows((prev) => rebalanceWeights(prev, idx, val));
  };

  const handleToggleActive = (idx: number, next: boolean) => {
    setRows((prev) => {
      const updated = prev.map((r, i) => (i === idx ? { ...r, is_active: next } : r));
      // Re-normalize the active set so it sums to 100
      return normalizeActive(updated);
    });
  };

  const handleDelete = (idx: number) => {
    setRows((prev) => {
      const row = prev[idx];
      let updated: PairRow[];
      if (row._isNew) {
        updated = prev.filter((_, i) => i !== idx);
      } else {
        updated = prev.map((r, i) => (i === idx ? { ...r, _deleted: true, is_active: false } : r));
      }
      return normalizeActive(updated);
    });
  };

  const handleNormalize = () => {
    setRows((prev) => normalizeActive(prev));
  };

  const handleAddPair = (a: string, b: string) => {
    if (!a || !b || a === b) {
      toast({ title: "Pick two different corridors", variant: "destructive" });
      return;
    }
    const key = pairKey(a, b);
    const exists = rows.some((r) => !r._deleted && pairKey(r.corridor_a, r.corridor_b) === key);
    if (exists) {
      toast({ title: "Pair already exists", variant: "destructive" });
      return;
    }
    setRows((prev) => {
      const next: PairRow[] = [
        ...prev,
        {
          id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          corridor_a: a,
          corridor_b: b,
          weight: 0,
          is_active: true,
          sort_order: prev.length + 1,
          _isNew: true,
        },
      ];
      return normalizeActive(next);
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Total count
      const { error: settingsErr } = await supabase
        .from("featured_settings")
        .update({ total_count: totalCount, updated_at: new Date().toISOString() })
        .eq("id", true);
      if (settingsErr) throw settingsErr;

      // 2. Deletions
      const toDelete = rows.filter((r) => r._deleted && !r._isNew).map((r) => r.id);
      if (toDelete.length) {
        const { error } = await supabase.from("featured_corridor_pairs").delete().in("id", toDelete);
        if (error) throw error;
      }

      // 3. Inserts
      const toInsert = rows
        .filter((r) => r._isNew && !r._deleted)
        .map((r, i) => ({
          corridor_a: r.corridor_a,
          corridor_b: r.corridor_b,
          weight: r.weight,
          is_active: r.is_active,
          sort_order: r.sort_order || i + 1,
        }));
      if (toInsert.length) {
        const { error } = await supabase.from("featured_corridor_pairs").insert(toInsert);
        if (error) throw error;
      }

      // 4. Updates
      const toUpdate = rows.filter((r) => !r._isNew && !r._deleted);
      for (const r of toUpdate) {
        const { error } = await supabase
          .from("featured_corridor_pairs")
          .update({
            weight: r.weight,
            is_active: r.is_active,
            sort_order: r.sort_order,
            updated_at: new Date().toISOString(),
          })
          .eq("id", r.id);
        if (error) throw error;
      }

      toast({ title: "Saved", description: "Featured settings updated." });
      await qc.invalidateQueries({ queryKey: ["featured_settings"] });
      await qc.invalidateQueries({ queryKey: ["featured_corridor_pairs"] });
      await qc.invalidateQueries({ queryKey: ["featured-empty-legs-config"] });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const isLoading = settingsQuery.isLoading || pairsQuery.isLoading || corridorsLoading;

  return (
    <DashboardLayout>
      <PageHeader
        title="Featured Settings"
        description="Control the empty legs shown in the public Featured Upcoming Empty Legs section."
      />

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-6 max-w-4xl">
          {/* Total count */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Number of empty legs displayed</h3>
                <p className="text-xs text-muted-foreground">
                  Total slots in the Featured section (1–50).
                </p>
              </div>
              <Input
                type="number"
                min={1}
                max={50}
                value={totalCount}
                onChange={(e) =>
                  setTotalCount(Math.max(1, Math.min(50, parseInt(e.target.value || "0", 10) || 0)))
                }
                className="w-24"
              />
            </div>
            <Slider
              value={[totalCount]}
              min={1}
              max={50}
              step={1}
              onValueChange={(v) => setTotalCount(v[0])}
            />
          </div>

          {/* Pairs */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Corridor pairs</h3>
                <p className="text-xs text-muted-foreground">
                  Each pair covers both directions. Active weights sum to{" "}
                  <span className={Math.round(activeSum) === 100 ? "text-foreground" : "text-destructive"}>
                    {activeSum.toFixed(1)}%
                  </span>
                  .
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleNormalize}>
                  Normalize
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              {visibleRows.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No pairs configured.
                </p>
              )}
              {rows.map((row, idx) => {
                if (row._deleted) return null;
                return (
                  <div
                    key={row.id}
                    className={`grid grid-cols-12 gap-3 items-center rounded-md border border-border/60 p-3 ${
                      row.is_active ? "" : "opacity-60"
                    }`}
                  >
                    <div className="col-span-4 text-sm font-medium truncate">
                      {corridorLabel(row.corridor_a)}{" "}
                      <span className="text-muted-foreground">↔</span>{" "}
                      {corridorLabel(row.corridor_b)}
                    </div>
                    <div className="col-span-2 flex items-center gap-2">
                      <Switch
                        checked={row.is_active}
                        onCheckedChange={(v) => handleToggleActive(idx, v)}
                      />
                      <span className="text-xs text-muted-foreground">
                        {row.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <div className="col-span-5 flex items-center gap-3">
                      <Slider
                        value={[row.weight]}
                        min={0}
                        max={100}
                        step={1}
                        disabled={!row.is_active}
                        onValueChange={(v) => handleWeightChange(idx, v[0])}
                        className="flex-1"
                      />
                      <span className="text-xs tabular-nums w-12 text-right">
                        {row.weight.toFixed(1)}%
                      </span>
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(idx)}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <AddPairControl corridors={corridors ?? []} onAdd={handleAddPair} />
          </div>

          <div className="flex justify-end gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save changes
            </Button>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function AddPairControl({
  corridors,
  onAdd,
}: {
  corridors: any[];
  onAdd: (a: string, b: string) => void;
}) {
  const [a, setA] = useState<string>("");
  const [b, setB] = useState<string>("");

  return (
    <div className="flex items-end gap-2 pt-3 border-t border-border/60">
      <div className="flex-1">
        <label className="text-xs text-muted-foreground mb-1 block">Corridor A</label>
        <CorridorPicker corridors={corridors} value={a} onChange={setA} excludeId={b} />
      </div>
      <div className="flex-1">
        <label className="text-xs text-muted-foreground mb-1 block">Corridor B</label>
        <CorridorPicker corridors={corridors} value={b} onChange={setB} excludeId={a} />
      </div>
      <Button
        size="sm"
        onClick={() => {
          onAdd(a, b);
          setA("");
          setB("");
        }}
        disabled={!a || !b || a === b}
      >
        <Plus className="h-4 w-4 mr-1" /> Add pair
      </Button>
    </div>
  );
}

function CorridorPicker({
  corridors,
  value,
  onChange,
  excludeId,
}: {
  corridors: any[];
  value: string;
  onChange: (v: string) => void;
  excludeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = corridors.find((c) => c.id === value);
  const filtered = corridors
    .filter((c) => c.id !== excludeId)
    .filter((c) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        c.id.toLowerCase().includes(q) ||
        (c.display_name || "").toLowerCase().includes(q)
      );
    })
    .slice(0, 100);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-start font-normal" role="combobox">
          {selected ? selected.display_name || selected.id : "Select corridor…"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <div className="p-2 border-b border-border">
          <Input
            placeholder="Search corridors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
            autoFocus
          />
        </div>
        <ScrollArea className="h-64">
          <div className="p-1">
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No matches</p>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(c.id);
                  setOpen(false);
                  setSearch("");
                }}
                className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <div className="font-medium">{c.display_name || c.id}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{c.id}</div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
