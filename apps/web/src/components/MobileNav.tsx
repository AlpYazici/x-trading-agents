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
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/agent", label: "Agentic", Icon: Brain },
  { href: "/runs", label: "Runs", Icon: Activity },
  { href: "/recommendations", label: "Picks", Icon: Sparkles },
  { href: "/reflection", label: "Reflection", Icon: Sparkles },
  { href: "/portfolio", label: "Portfolio", Icon: Briefcase },
  { href: "/trades", label: "Trades", Icon: ArrowLeftRight },
  { href: "/closed", label: "Closed", Icon: XCircle },
  { href: "/schedules", label: "Schedules", Icon: Calendar },
  { href: "/settings", label: "Settings", Icon: Settings },
];

export function MobileNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-stretch justify-between border-t bg-background/95 px-1 backdrop-blur lg:hidden"
    >
      {links.map(({ href, label, Icon }) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            title={label}
            className={cn(
              "flex flex-1 flex-col items-center justify-center rounded-md px-1 text-[10px] transition-colors",
              active
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-5 w-5" />
          </Link>
        );
      })}
    </nav>
  );
}
