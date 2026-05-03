"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiGet, type Run } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SignalBadge, StatusDot } from "@/components/SignalBadge";

export default function RunsPage() {
  const { data } = useQuery({
    queryKey: ["runs", "all"],
    queryFn: () => apiGet<Run[]>("/runs?limit=200"),
    refetchInterval: 5_000,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Runs</h1>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">#</TableHead>
                <TableHead>Ticker</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Signal</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    No runs yet.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer">
                    <TableCell className="font-mono text-muted-foreground">
                      <Link href={`/runs/${r.id}`} className="text-primary hover:underline">
                        {r.id}
                      </Link>
                    </TableCell>
                    <TableCell className="font-semibold">{r.ticker}</TableCell>
                    <TableCell className="text-muted-foreground">{r.trade_date}</TableCell>
                    <TableCell>
                      <StatusDot status={r.status} />
                    </TableCell>
                    <TableCell>
                      <SignalBadge signal={r.signal} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.started_at}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
