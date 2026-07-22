import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Plus, Trash2, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";

interface Subscription {
  id: string;
  email: string;
  enabled: boolean;
  last_sent_at: string | null;
  created_at: string;
}

async function invoke(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("manage-charter-digest", {
    body: { action, ...payload },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function DigestRecipientsPanel() {
  const qc = useQueryClient();
  const [newEmail, setNewEmail] = useState("");

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ["charter-digest-subs"],
    queryFn: async () => {
      const res = await invoke("list");
      return (res.subscriptions ?? []) as Subscription[];
    },
  });

  const addMut = useMutation({
    mutationFn: (email: string) => invoke("add", { email }),
    onSuccess: () => {
      setNewEmail("");
      qc.invalidateQueries({ queryKey: ["charter-digest-subs"] });
      toast({ title: "Recipient added" });
    },
    onError: (e: Error) => toast({ title: "Failed to add", description: e.message, variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      invoke("toggle", { id, enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["charter-digest-subs"] }),
    onError: (e: Error) => toast({ title: "Failed to update", description: e.message, variant: "destructive" }),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => invoke("remove", { id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["charter-digest-subs"] });
      toast({ title: "Recipient removed" });
    },
    onError: (e: Error) => toast({ title: "Failed to remove", description: e.message, variant: "destructive" }),
  });

  const onAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const email = newEmail.trim();
    if (!email) return;
    addMut.mutate(email);
  };

  return (
    <Card className="mb-6">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Monthly digest recipients</h3>
          <span className="text-xs text-muted-foreground ml-auto">
            Sent on the 1st of each month at 09:00 GMT
          </span>
        </div>

        <div className="space-y-2 mb-3">
          {isLoading ? (
            <div className="text-xs text-muted-foreground">Loading…</div>
          ) : subs.length === 0 ? (
            <div className="text-xs text-muted-foreground">No recipients yet.</div>
          ) : (
            subs.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-md border border-border/50 bg-muted/30 px-3 py-2"
              >
                <Switch
                  checked={s.enabled}
                  onCheckedChange={(enabled) => toggleMut.mutate({ id: s.id, enabled })}
                  disabled={toggleMut.isPending}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{s.email}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {s.enabled ? "Enabled" : "Disabled"}
                    {s.last_sent_at
                      ? ` · Last sent ${new Date(s.last_sent_at).toLocaleDateString()}`
                      : " · Never sent"}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeMut.mutate(s.id)}
                  disabled={removeMut.isPending}
                  title="Remove recipient"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        <form onSubmit={onAdd} className="flex items-center gap-2">
          <Input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="add-recipient@example.com"
            className="h-9 text-sm"
          />
          <Button type="submit" size="sm" disabled={addMut.isPending || !newEmail.trim()}>
            {addMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" /> Add
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
