import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function SignalBadge({ signal }: { signal: string | null | undefined }) {
  if (!signal) return null;
  const s = signal.toUpperCase();
  const cls =
    s.includes("BUY")
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
      : s.includes("SELL")
        ? "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/20"
        : "bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("font-semibold", cls)}>
      {s}
    </Badge>
  );
}

export function StatusDot({ status }: { status: string }) {
  const m: Record<string, string> = {
    completed: "bg-emerald-500",
    running: "bg-amber-500 pulse-soft",
    pending: "bg-muted-foreground/50",
    failed: "bg-red-500",
  };
  const t: Record<string, string> = {
    completed: "text-emerald-600 dark:text-emerald-400",
    running: "text-amber-600 dark:text-amber-400",
    pending: "text-muted-foreground",
    failed: "text-red-600 dark:text-red-400",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={cn("h-1.5 w-1.5 rounded-full", m[status] ?? m.pending)} />
      <span className={t[status] ?? t.pending}>{status}</span>
    </span>
  );
}
