"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Play, Trash2, Pencil, Clock } from "lucide-react";
import { toast } from "sonner";

import { apiGet, apiPost, apiDelete, API_BASE } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Schedule = {
  id: number;
  name: string;
  symbols: string[];
  cron: string;
  timezone: string;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  notes: string | null;
};

type SchedulePayload = {
  name: string;
  symbols: string[];
  cron: string;
  timezone: string;
  enabled: boolean;
  notes: string | null;
};

const CRON_PRESETS: { label: string; value: string; tz: string }[] = [
  { label: "Weekday 9:30 ET (market open)", value: "30 9 * * 1-5", tz: "America/New_York" },
  { label: "Weekday 16:00 ET (market close)", value: "0 16 * * 1-5", tz: "America/New_York" },
  { label: "Monday 8 AM (weekly)", value: "0 8 * * 1", tz: "America/New_York" },
  { label: "Every 4 hours", value: "0 */4 * * *", tz: "UTC" },
  { label: "Daily midnight", value: "0 0 * * *", tz: "UTC" },
];

const TIMEZONES = ["America/New_York", "Europe/Istanbul", "UTC"];

function formatTs(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function parseSymbols(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw.split(/[\s,;\n]+/)) {
    const u = s.trim().toUpperCase();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

export default function SchedulesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);

  const { data: schedules } = useQuery({
    queryKey: ["schedules"],
    queryFn: () => apiGet<Schedule[]>("/schedules"),
    refetchInterval: 10_000,
  });

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(row: Schedule) {
    setEditing(row);
    setOpen(true);
  }

  async function toggle(id: number) {
    try {
      await apiPost(`/schedules/${id}/toggle`);
      qc.invalidateQueries({ queryKey: ["schedules"] });
    } catch (e) {
      toast.error("Toggle failed", { description: String(e) });
    }
  }

  async function runNow(id: number, name: string) {
    if (!confirm(`Run "${name}" now? This will fire all symbols immediately.`)) return;
    try {
      const res = await apiPost<{ started: number; failed: string[] }>(
        `/schedules/${id}/run-now`
      );
      const failedNote = res.failed.length ? ` (${res.failed.length} failed)` : "";
      toast.success(`Started ${res.started} runs${failedNote}`);
      qc.invalidateQueries({ queryKey: ["schedules"] });
    } catch (e) {
      toast.error("Run failed", { description: String(e) });
    }
  }

  async function remove(id: number, name: string) {
    if (!confirm(`Delete schedule "${name}"?`)) return;
    try {
      await apiDelete(`/schedules/${id}`);
      toast.success("Schedule deleted");
      qc.invalidateQueries({ queryKey: ["schedules"] });
    } catch (e) {
      toast.error("Delete failed", { description: String(e) });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Schedules</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cron-driven batch agent runs. Each fire kicks off one debate per symbol.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger>
            <span
              onClick={openNew}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              New schedule
            </span>
          </DialogTrigger>
          <ScheduleFormDialog
            initial={editing}
            onSaved={() => {
              setOpen(false);
              qc.invalidateQueries({ queryKey: ["schedules"] });
            }}
          />
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Active schedules
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Symbols</TableHead>
                <TableHead>Cron</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Last run</TableHead>
                <TableHead>Next run</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!schedules?.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                    No schedules yet. Click <span className="font-medium">+ New schedule</span> to add one.
                  </TableCell>
                </TableRow>
              ) : (
                schedules.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {s.symbols.map((sym) => (
                          <Badge key={sym} variant="outline" className="font-mono text-[10px]">
                            {sym}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.cron}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.timezone}</TableCell>
                    <TableCell>
                      <Switch
                        checked={s.enabled}
                        onCheckedChange={() => toggle(s.id)}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTs(s.last_run_at)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTs(s.next_run_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => runNow(s.id, s.name)}
                          className="h-7 gap-1"
                          title="Run now"
                        >
                          <Play className="h-3 w-3" /> Run
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => openEdit(s)}
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => remove(s.id, s.name)}
                          title="Delete"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        API: <span className="font-mono">{API_BASE}</span>
      </p>
    </div>
  );
}

function ScheduleFormDialog({
  initial,
  onSaved,
}: {
  initial: Schedule | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [symbolsRaw, setSymbolsRaw] = useState(initial?.symbols.join(", ") ?? "");
  const [cron, setCron] = useState(initial?.cron ?? "30 9 * * 1-5");
  const [timezone, setTimezone] = useState(initial?.timezone ?? "America/New_York");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const parsedSymbols = parseSymbols(symbolsRaw);
  const isEdit = initial != null;

  function applyPreset(value: string, tz: string) {
    setCron(value);
    setTimezone(tz);
  }

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (parsedSymbols.length === 0) {
      toast.error("Add at least one symbol");
      return;
    }
    if (!cron.trim()) {
      toast.error("Cron expression is required");
      return;
    }

    const payload: SchedulePayload = {
      name: name.trim(),
      symbols: parsedSymbols,
      cron: cron.trim(),
      timezone,
      enabled: initial?.enabled ?? true,
      notes: notes.trim() || null,
    };

    setBusy(true);
    try {
      if (isEdit && initial) {
        const r = await fetch(`${API_BASE}/schedules/${initial.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
        toast.success("Schedule updated");
      } else {
        await apiPost("/schedules", payload);
        toast.success("Schedule created");
      }
      onSaved();
    } catch (e) {
      toast.error("Save failed", { description: String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{isEdit ? "Edit schedule" : "New schedule"}</DialogTitle>
        <DialogDescription>
          Cron-fired batch run. Symbols are debated independently when the trigger fires.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="sched-name">Name</Label>
          <Input
            id="sched-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Morning watchlist"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sched-symbols">
            Symbols
            <span className="ml-2 text-xs text-muted-foreground">
              {parsedSymbols.length} parsed
            </span>
          </Label>
          <textarea
            id="sched-symbols"
            value={symbolsRaw}
            onChange={(e) => setSymbolsRaw(e.target.value)}
            rows={2}
            placeholder="NVDA, AAPL, MSFT"
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {parsedSymbols.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {parsedSymbols.map((s) => (
                <Badge key={s} variant="outline" className="font-mono text-[10px]">
                  {s}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Quick presets</Label>
          <div className="flex flex-wrap gap-1.5">
            {CRON_PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => applyPreset(p.value, p.tz)}
                className={`rounded-md border px-2 py-1 text-xs transition hover:bg-muted ${
                  cron === p.value ? "border-primary bg-primary/10" : "border-border"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="sched-cron">Cron expression</Label>
            <Input
              id="sched-cron"
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              placeholder="30 9 * * 1-5"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sched-tz">Timezone</Label>
            <select
              id="sched-tz"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sched-notes">Notes (optional)</Label>
          <Input
            id="sched-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Why this schedule exists"
          />
        </div>
      </div>

      <DialogFooter>
        <Button type="button" onClick={save} disabled={busy}>
          {busy ? "Saving..." : isEdit ? "Save changes" : "Create schedule"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
