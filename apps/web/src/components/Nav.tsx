"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPost, type Safety } from "@/lib/api";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/runs", label: "Runs" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/trades", label: "Trades" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  const { data: safety, refetch } = useQuery({
    queryKey: ["safety"],
    queryFn: () => apiGet<Safety>("/safety"),
    refetchInterval: 5_000,
  });

  const killed = safety?.kill_switch.engaged;
  const live = safety?.live_mode;

  async function toggleKill() {
    if (killed) {
      await apiPost("/safety/release");
    } else {
      const reason = window.prompt("Engage kill switch — reason?", "manual");
      if (reason === null) return;
      await apiPost("/safety/kill", { reason });
    }
    refetch();
  }

  return (
    <nav className="border-b border-zinc-800 bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
        <span className="font-semibold">trading-agents-claude</span>
        <div className="flex gap-4 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={path === l.href ? "text-white" : "text-zinc-400 hover:text-zinc-200"}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span
            className={`rounded px-2 py-1 ${
              live ? "bg-red-900 text-red-200" : "bg-emerald-900 text-emerald-200"
            }`}
          >
            {live ? "LIVE" : "PAPER"}
          </span>
          <button
            onClick={toggleKill}
            className={`rounded px-3 py-1 font-medium ${
              killed
                ? "bg-amber-700 hover:bg-amber-600"
                : "bg-zinc-800 hover:bg-zinc-700"
            }`}
          >
            {killed ? `KILL: ${safety?.kill_switch.reason ?? "engaged"} — release` : "Kill switch"}
          </button>
        </div>
      </div>
    </nav>
  );
}
