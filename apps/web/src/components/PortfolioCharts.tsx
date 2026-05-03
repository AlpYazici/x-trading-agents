"use client";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import type { Holding } from "@/lib/api";

const COLORS = [
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#ec4899", // pink
  "#10b981", // emerald
  "#3b82f6", // blue
  "#ef4444", // red
];

export function AllocationPie({ holdings }: { holdings: Holding[] }) {
  const data = holdings
    .filter((h) => h.market_value_usd != null)
    .map((h) => ({ name: h.symbol, value: h.market_value_usd! }));

  if (data.length === 0)
    return <Empty msg="Add holdings to see allocation" />;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={95}
          paddingAngle={2}
          stroke="none"
          label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
          labelLine={false}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
          }}
          formatter={(v) =>
            new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v))
          }
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function PnlBars({ holdings }: { holdings: Holding[] }) {
  const data = holdings
    .filter((h) => h.pl != null && h.market_value_usd != null)
    .map((h) => {
      const plUsd = h.fx_rate ? h.pl! * h.fx_rate : h.pl!;
      return { name: h.symbol, pl: Number(plUsd.toFixed(2)) };
    })
    .sort((a, b) => b.pl - a.pl);

  if (data.length === 0) return <Empty msg="No P&L data yet" />;

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 4" stroke="var(--border)" />
        <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
        <YAxis
          stroke="var(--muted-foreground)"
          fontSize={11}
          tickFormatter={(v) =>
            v >= 1000 || v <= -1000 ? `${(v / 1000).toFixed(1)}k` : v.toString()
          }
        />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 12,
          }}
          formatter={(v) =>
            new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(v))
          }
          cursor={{ fill: "var(--accent)", opacity: 0.3 }}
        />
        <Bar dataKey="pl" radius={[8, 8, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.pl >= 0 ? "#10b981" : "#ef4444"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
      {msg}
    </div>
  );
}
