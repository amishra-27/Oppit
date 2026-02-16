"use client";

import { useState, useMemo } from "react";

// ── Row type ──

export type DailyStationRow = {
  /** Machine / station name. */
  machineName: string;
  /** Calendar date string (YYYY-MM-DD). */
  date: string;
  /** Utilization 0–1. */
  utilization: number;
  /** Runtime in hours. */
  runtimeHours: number;
  /** Number of stop events. */
  stopCount: number;
  /** Average stop duration in seconds. */
  avgStopDurationSec: number;
  /** Total rotations. */
  rotationsTotal: number;
};

// ── Props ──

interface PlantDailyMetricsTableProps {
  rows: DailyStationRow[];
  isLoading: boolean;
  error: string | null;
}

// ── Sortable column definitions ──

type SortField = keyof Pick<
  DailyStationRow,
  "machineName" | "date" | "utilization" | "runtimeHours" | "stopCount" | "avgStopDurationSec" | "rotationsTotal"
>;

type SortDir = "asc" | "desc";

const COLUMNS: { key: SortField; label: string; align: "left" | "right" }[] = [
  { key: "machineName", label: "Station", align: "left" },
  { key: "date", label: "Date", align: "left" },
  { key: "utilization", label: "Utilization", align: "right" },
  { key: "runtimeHours", label: "Runtime", align: "right" },
  { key: "stopCount", label: "Stops", align: "right" },
  { key: "avgStopDurationSec", label: "Avg Stop", align: "right" },
  { key: "rotationsTotal", label: "Rotations", align: "right" },
];

// ── Format helpers ──

function fmtPercent(frac: number): string {
  return `${(frac * 100).toFixed(1)}%`;
}

function fmtHours(h: number): string {
  if (h < 0.01) return "0m";
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
}

function fmtDuration(sec: number): string {
  if (sec <= 0) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Utilization bar ──

function UtilBar({ value }: { value: number }) {
  const pct = Math.min(Math.max(value, 0), 1) * 100;
  const color =
    pct >= 80
      ? "bg-emerald-500"
      : pct >= 50
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden max-w-[60px]">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular-nums">{fmtPercent(value)}</span>
    </div>
  );
}

// ── Sort arrow icon ──

function SortIcon({ dir }: { dir: SortDir | null }) {
  if (!dir) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-3 h-3 text-zinc-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-3 h-3 text-emerald-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      {dir === "asc" ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      )}
    </svg>
  );
}

// ── Loading skeleton ──

function TableSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 overflow-hidden">
      {/* Header skeleton */}
      <div className="flex gap-4 px-4 py-3 border-b border-zinc-800">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-3 bg-zinc-800 rounded animate-pulse"
            style={{ width: i === 0 ? 100 : 60 }}
          />
        ))}
      </div>
      {/* Row skeletons */}
      {Array.from({ length: 4 }).map((_, r) => (
        <div
          key={r}
          className="flex gap-4 px-4 py-3 border-b border-zinc-800/50 last:border-b-0"
        >
          {Array.from({ length: 7 }).map((_, c) => (
            <div
              key={c}
              className="h-3 bg-zinc-800/60 rounded animate-pulse"
              style={{ width: c === 0 ? 80 : 48, animationDelay: `${(r * 7 + c) * 40}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Main component ──

export default function PlantDailyMetricsTable({
  rows,
  isLoading,
  error,
}: PlantDailyMetricsTableProps) {
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      // Default desc for numeric fields, asc for text/date
      setSortDir(field === "machineName" || field === "date" ? "asc" : "desc");
    }
  };

  const sorted = useMemo(() => {
    if (!rows || rows.length === 0) return [];
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      let cmp: number;
      if (typeof av === "string" && typeof bv === "string") {
        cmp = av.localeCompare(bv);
      } else {
        cmp = (av as number) - (bv as number);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortField, sortDir]);

  // ── States ──

  if (isLoading) return <TableSkeleton />;

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <p className="text-sm text-red-400">Failed to load daily metrics: {error}</p>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center">
        <p className="text-sm text-zinc-500">No daily metrics available for this period.</p>
      </div>
    );
  }

  // ── Render ──

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-2.5 font-medium text-[11px] uppercase tracking-wide text-zinc-500 select-none cursor-pointer hover:text-zinc-300 transition-colors whitespace-nowrap ${
                    col.align === "right" ? "text-right" : "text-left"
                  }`}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <SortIcon dir={sortField === col.key ? sortDir : null} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={`${row.machineName}-${row.date}-${i}`}
                className="border-b border-zinc-800/50 last:border-b-0 hover:bg-zinc-800/30 transition-colors"
              >
                {/* Station */}
                <td className="px-4 py-2.5 font-medium text-zinc-200 whitespace-nowrap">
                  {row.machineName}
                </td>
                {/* Date */}
                <td className="px-4 py-2.5 text-zinc-400 whitespace-nowrap">
                  {fmtDate(row.date)}
                </td>
                {/* Utilization */}
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <UtilBar value={row.utilization} />
                </td>
                {/* Runtime */}
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-300 whitespace-nowrap">
                  {fmtHours(row.runtimeHours)}
                </td>
                {/* Stops */}
                <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                  <span
                    className={
                      row.stopCount > 0
                        ? "text-amber-400"
                        : "text-zinc-500"
                    }
                  >
                    {row.stopCount}
                  </span>
                </td>
                {/* Avg Stop Duration */}
                <td className="px-4 py-2.5 text-right tabular-nums whitespace-nowrap">
                  <span
                    className={
                      row.stopCount > 0
                        ? "text-red-400"
                        : "text-zinc-500"
                    }
                  >
                    {row.stopCount > 0 ? fmtDuration(row.avgStopDurationSec) : "—"}
                  </span>
                </td>
                {/* Rotations */}
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-300 whitespace-nowrap">
                  {fmtNumber(row.rotationsTotal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
