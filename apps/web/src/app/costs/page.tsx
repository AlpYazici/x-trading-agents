"use client";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  Activity,
  Calendar,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Bucket = {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number;
  cost_usd: number;
};
type Summary = {
  today: Bucket;
  last_7d: Bucket;
  last_30d: Bucket;
  all_time: Bucket;
  by_model: { model: string; calls: number; input_tokens: number; output_tokens: number; cost_usd: number }[];
};
type PerRun = { run_id: number; calls: number; input_tokens: number; output_tokens: number; cost_usd: number };

export default function CostsPage() {
  const { data: summary } = useQuery({
    queryKey: ["costs", "summary"],
    queryFn: () => apiGet<Summary>("/costs"),
    refetchInterval: 30_000,
  });
  const { data: perRun } = useQuery({
    queryKey: ["costs", "per-run"],
    queryFn: () => apiGet<PerRun[]>("/costs/per-run"),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">LLM costs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Anthropic token usage + dollar spend per run, period, and model.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Today" value={fmt(summary?.today.cost_usd)} sub={`${summary?.today.calls ?? 0} calls`} Icon={Calendar} />
        <Stat label="Last 7 days" value={fmt(summary?.last_7d.cost_usd)} sub={`${summary?.last_7d.calls ?? 0} calls`} Icon={Activity} />
        <Stat label="Last 30 days" value={fmt(summary?.last_30d.cost_usd)} sub={`${summary?.last_30d.calls ?? 0} calls`} Icon={TrendingUp} />
        <Stat label="All time" value={fmt(summary?.all_time.cost_usd)} sub={`${summary?.all_time.calls ?? 0} calls`} Icon={DollarSign} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">By model</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!summary?.by_model.length ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No data yet.</div>
            ) : (
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Calls</TableHead>
                    <TableHead>Input tokens</TableHead>
                    <TableHead>Output tokens</TableHead>
                    <TableHead>Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.by_model.map((m) => (
                    <TableRow key={m.model}>
                      <TableCell className="font-mono text-xs">{m.model}</TableCell>
                      <TableCell>{m.calls}</TableCell>
                      <TableCell>{m.input_tokens.toLocaleString()}</TableCell>
                      <TableCell>{m.output_tokens.toLocaleString()}</TableCell>
                      <TableCell className="font-mono">{fmt(m.cost_usd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Token breakdown (last 7d)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="Input" value={summary?.last_7d.input_tokens.toLocaleString() ?? "—"} />
            <Row label="Output" value={summary?.last_7d.output_tokens.toLocaleString() ?? "—"} />
            <Row label="Cache read" value={(summary?.last_7d.cache_read_tokens ?? 0).toLocaleString()} />
            <Row label="Total cost" value={fmt(summary?.last_7d.cost_usd)} bold />
            <p className="mt-2 text-[11px] text-muted-foreground">
              Estimated rates (May 2026): Sonnet 4.6 input $3/M, output $15/M; Opus 4.7 input $15/M, output $75/M.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Per-run cost</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!perRun?.length ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No runs tracked yet.</div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>Input</TableHead>
                  <TableHead>Output</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perRun.map((r) => (
                  <TableRow key={r.run_id}>
                    <TableCell>
                      <Link className="text-primary hover:underline" href={`/runs/${r.run_id}`}>
                        #{r.run_id}
                      </Link>
                    </TableCell>
                    <TableCell>{r.calls}</TableCell>
                    <TableCell>{r.input_tokens.toLocaleString()}</TableCell>
                    <TableCell>{r.output_tokens.toLocaleString()}</TableCell>
                    <TableCell className="font-mono">{fmt(r.cost_usd)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  Icon,
}: {
  label: string;
  value: string;
  sub: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-2 font-mono text-2xl font-semibold tabular-nums">{value}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between border-b py-2 last:border-0 ${bold ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function fmt(n: number | undefined): string {
  if (n == null) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}
