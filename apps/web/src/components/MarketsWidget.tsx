"use client";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Banknote,
  Flame,
  Building2,
  Bitcoin,
  X,
  GripVertical,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/api";
import {
  useMarketGroup,
  type GroupKey,
  type MarketDef,
} from "@/lib/userMarkets";
import { AddMarketDialog } from "./AddMarketDialog";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Quote = {
  symbol: string;
  last: number | null;
  prev_close: number | null;
  change: number | null;
  change_pct: number | null;
  sparkline: number[];
};

export function MarketsGroups() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <MarketGroup group="stocks" title="Stocks" Icon={Building2} accent="violet" />
      <MarketGroup group="crypto" title="Crypto" Icon={Bitcoin} accent="orange" />
      <MarketGroup group="indices" title="Indices" Icon={BarChart3} accent="blue" />
      <MarketGroup group="currencies" title="Currencies" Icon={Banknote} accent="emerald" />
      <MarketGroup group="commodities" title="Commodities" Icon={Flame} accent="amber" />
    </div>
  );
}

function MarketGroup({
  group,
  title,
  Icon,
  accent,
}: {
  group: GroupKey;
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent: "violet" | "blue" | "emerald" | "amber" | "orange";
}) {
  const { list, remove, reorder } = useMarketGroup(group);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = list.findIndex((m) => m.symbol === active.id);
    const to = list.findIndex((m) => m.symbol === over.id);
    if (from === -1 || to === -1) return;
    reorder(from, to);
  }
  const accents = {
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  }[accent];

  const queries = useQueries({
    queries: list.map((m) => ({
      queryKey: ["quote", m.symbol, m.exchange],
      queryFn: () =>
        apiGet<Quote>(
          `/ohlc/quote?symbol=${encodeURIComponent(m.symbol)}&exchange=${m.exchange}`
        ),
      refetchInterval: 60_000,
      staleTime: 30_000,
    })),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`rounded-lg p-1.5 ${accents}`}>
            <Icon className="h-4 w-4" />
          </div>
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <span className="text-[11px] text-muted-foreground">{list.length}</span>
        </div>
        <AddMarketDialog
          defaultGroup={group}
          trigger={
            <span className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground">
              + Add
            </span>
          }
        />
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            Empty — click "+ Add" above.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={list.map((m) => m.symbol)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {list.map((m, i) => (
                  <SortableMarketTile
                    key={m.symbol}
                    def={m}
                    quote={queries[i].data}
                    onRemove={() => remove(m.symbol)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}

function SortableMarketTile(props: {
  def: MarketDef;
  quote: Quote | undefined;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.def.symbol });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
  };
  return (
    <div ref={setNodeRef} style={style} className="group/sortable relative">
      {/* Drag handle is a SIBLING of the Link, not nested — Next.js Link
          swallows pointer events otherwise and dnd-kit never activates. */}
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label="Drag to reorder"
        className="absolute left-1.5 top-1.5 z-20 cursor-grab touch-none rounded-md bg-card/70 p-1 text-muted-foreground opacity-0 backdrop-blur transition hover:bg-accent hover:text-foreground active:cursor-grabbing group-hover/sortable:opacity-100"
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <MarketTile {...props} hasDragHandle />
    </div>
  );
}

function MarketTile({
  def,
  quote,
  onRemove,
  hasDragHandle = false,
}: {
  def: MarketDef;
  quote: Quote | undefined;
  onRemove: () => void;
  hasDragHandle?: boolean;
}) {
  const last = quote?.last ?? null;
  const pct = quote?.change_pct ?? null;
  const up = (pct ?? 0) >= 0;

  const href = `/chart?s=${encodeURIComponent(def.symbol)}&ex=${encodeURIComponent(
    def.exchange
  )}&label=${encodeURIComponent(def.label)}`;

  function handleRemove(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`Remove ${def.label} from this group?`)) onRemove();
  }

  return (
    <Link
      href={href}
      className="group relative block rounded-xl border bg-card/40 p-3 transition hover:border-primary/40 hover:bg-card hover:shadow-md"
    >
      <button
        onClick={handleRemove}
        className="absolute right-1.5 top-1.5 z-10 rounded-md p-1 text-muted-foreground opacity-0 transition hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
        aria-label="Remove"
      >
        <X className="h-3 w-3" />
      </button>
      <div className={`flex items-start justify-between gap-2 pr-4 ${hasDragHandle ? "pl-5" : ""}`}>
        <div className="min-w-0">
          <div className="truncate text-xs font-medium text-muted-foreground group-hover:text-foreground">
            {def.label}
          </div>
          <div className="mt-0.5 truncate font-mono text-base font-semibold tabular-nums">
            {last == null ? "—" : fmt(last)}
          </div>
        </div>
        <Sparkline data={quote?.sparkline ?? []} up={up} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        {pct != null ? (
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium ${
              up
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-red-500/10 text-red-600 dark:text-red-400"
            }`}
          >
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {(pct * 100).toFixed(2)}%
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {def.unit && <span className="text-muted-foreground">{def.unit}</span>}
      </div>
    </Link>
  );
}

function Sparkline({ data, up }: { data: number[]; up: boolean }) {
  if (!data || data.length < 2) return <div className="h-9 w-20" />;
  const w = 80;
  const h = 36;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const path = data
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const color = up ? "#10b981" : "#ef4444";
  const fillId = `g-${up ? "u" : "d"}-${Math.random().toString(36).slice(2, 6)}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="flex-shrink-0">
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L${w},${h} L0,${h} Z`} fill={`url(#${fillId})`} />
      <path d={path} stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function fmt(n: number): string {
  if (Math.abs(n) >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (Math.abs(n) >= 10) return n.toFixed(2);
  if (Math.abs(n) >= 1) return n.toFixed(3);
  return n.toFixed(4);
}
