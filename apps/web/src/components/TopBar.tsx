"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, ShieldOff } from "lucide-react";
import { apiGet, apiPost, type Safety } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "./ThemeToggle";
import { toast } from "sonner";

export function TopBar() {
  const qc = useQueryClient();
  const { data: safety } = useQuery({
    queryKey: ["safety"],
    queryFn: () => apiGet<Safety>("/safety"),
    refetchInterval: 5_000,
    retry: 1,
  });

  const killed = safety?.kill_switch.engaged;
  const live = safety?.live_mode;

  async function toggleKill() {
    if (killed) {
      await apiPost("/safety/release");
      toast.success("Kill switch released");
    } else {
      const reason = window.prompt("Engage kill switch — reason?", "manual");
      if (reason === null) return;
      await apiPost("/safety/kill", { reason });
      toast.warning("Kill switch engaged", { description: reason });
    }
    qc.invalidateQueries({ queryKey: ["safety"] });
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur lg:px-6">
      <div className="flex items-center gap-2 text-xs">
        <span className="pulse-soft inline-block h-2 w-2 rounded-full bg-emerald-500" />
        <span className="text-muted-foreground">API</span>
      </div>
      <Separator orientation="vertical" className="h-4" />
      <Badge variant={live ? "destructive" : "secondary"} className="text-[10px]">
        {live === undefined ? "..." : live ? "LIVE" : "PAPER"}
      </Badge>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant={killed ? "destructive" : "outline"}
          size="sm"
          onClick={toggleKill}
          className="gap-1.5"
        >
          {killed ? <ShieldOff className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
          <span className="hidden md:inline">
            {killed ? `Kill: ${safety?.kill_switch.reason}` : "Kill switch"}
          </span>
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
