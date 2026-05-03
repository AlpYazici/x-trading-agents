"use client";
import { useQuery } from "@tanstack/react-query";
import { Shield, Sliders, Power } from "lucide-react";
import { apiGet, type Safety } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SettingsPage() {
  const { data } = useQuery({
    queryKey: ["safety", "full"],
    queryFn: () => apiGet<Safety>("/safety"),
    refetchInterval: 5_000,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Settings & Safety</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Power className="h-3.5 w-3.5 text-muted-foreground" />
              Mode
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${data?.live_mode ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {data?.live_mode ? "LIVE" : "PAPER"}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Manual approval: <span className="font-semibold text-foreground">{data?.manual_approval ? "ON" : "OFF"}</span>
            </p>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Set via <code className="rounded bg-muted px-1 font-mono">ALPACA_LIVE</code> + <code className="rounded bg-muted px-1 font-mono">ALPACA_MANUAL_APPROVAL</code> env vars. Restart API to change.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
              Kill switch
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${data?.kill_switch.engaged ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {data?.kill_switch.engaged ? "ENGAGED" : "DISENGAGED"}
            </div>
            {data?.kill_switch.engaged && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                Reason: {data.kill_switch.reason} · since {data.kill_switch.engaged_at}
              </p>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              Toggle from the top-right of the navbar.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Sliders className="h-3.5 w-3.5 text-muted-foreground" />
            Risk limits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {data?.limits &&
              Object.entries(data.limits).map(([k, v]) => (
                <div key={k} className="rounded-xl border bg-card/50 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {k.replace(/_/g, " ")}
                  </div>
                  <div className="mt-1 font-mono text-base">{v}</div>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
