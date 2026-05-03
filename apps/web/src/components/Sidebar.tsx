"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Activity,
  Briefcase,
  ArrowLeftRight,
  Settings,
  Brain,
  Sparkles,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/agent", label: "Agentic", Icon: Brain, badge: "AI" },
  { href: "/runs", label: "Runs", Icon: Activity },
  { href: "/recommendations", label: "Daily picks", Icon: Sparkles, badge: "AI" },
  { href: "/reflection", label: "Reflection", Icon: Sparkles },
  { href: "/portfolio", label: "Portfolio", Icon: Briefcase },
  { href: "/trades", label: "Trades", Icon: ArrowLeftRight },
  { href: "/closed", label: "Closed", Icon: ArrowLeftRight },
  { href: "/schedules", label: "Schedules", Icon: Calendar },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="hidden w-56 flex-col border-r bg-sidebar px-3 py-6 lg:flex">
      <nav className="flex flex-col gap-1">
        {links.map(({ href, label, Icon, badge }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <div className="flex items-center gap-3">
                <Icon className={cn("h-4 w-4", active ? "text-primary" : "")} />
                {label}
              </div>
              {badge && (
                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
