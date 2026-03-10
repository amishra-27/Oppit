"use client";

import type { ReactNode } from "react";

// ── Types ──

type Trend = "up" | "flat" | "down" | "insufficient_data";

interface RpmTrendComparisonCardProps {
  shortAvgRpmRunning: number | null;
  longAvgRpmRunning: number | null;
  deltaPctRunning: number | null;
  trend: Trend;
  isLoading: boolean;
  error: string | null;
  /** Label for the short window, e.g. "15 min" */
  shortLabel?: string;
  /** Label for the long window, e.g. "24 hr" */
  longLabel?: string;
}

// ── Helpers ──

function fmtRpm(n: number): string {
  return `${n.toFixed(1)} RPM`;
}

function fmtDelta(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

const trendConfig: Record<
  Trend,
  { icon: ReactNode; color: string; accent: string; label: string }
> = {
  up: {
    label: "Trending up",
    color: "text-emerald-400",
    accent: "bg-emerald-500",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      </svg>
    ),
  },
  down: {
    label: "Trending down",
    color: "text-red-400",
    accent: "bg-red-500",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    ),
  },
  flat: {
    label: "Stable",
    color: "text-zinc-400",
    accent: "bg-zinc-600",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
      </svg>
    ),
  },
  insufficient_data: {
    label: "Not enough data",
    color: "text-zinc-500",
    accent: "bg-zinc-700",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01"
        />
      </svg>
    ),
  },
};

// ── Component ──

export default function RpmTrendComparisonCard({
  shortAvgRpmRunning,
  longAvgRpmRunning,
  deltaPctRunning,
  trend,
  isLoading,
  error,
  shortLabel = "Short",
  longLabel = "Long",
}: RpmTrendComparisonCardProps) {
  // ── Loading ──
  if (isLoading) {
    return (
      <div className="relative rounded-xl border border-zinc-800 bg-zinc-900/80 p-5 animate-pulse overflow-hidden">
        <div className="h-3 w-28 bg-zinc-800 rounded mb-3" />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="h-3 w-16 bg-zinc-800 rounded mb-2" />
            <div className="h-7 w-24 bg-zinc-800 rounded" />
          </div>
          <div>
            <div className="h-3 w-16 bg-zinc-800 rounded mb-2" />
            <div className="h-7 w-24 bg-zinc-800 rounded" />
          </div>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5 text-center">
        <p className="text-sm text-red-400">Failed to load RPM trend: {error}</p>
      </div>
    );
  }

  // ── Insufficient data ──
  if (trend === "insufficient_data") {
    const cfg = trendConfig.insufficient_data;
    return (
      <div className="relative rounded-xl border border-zinc-800 bg-zinc-900/80 p-5 overflow-hidden">
        <div className={`absolute top-0 left-0 right-0 h-0.5 ${cfg.accent}`} />
        <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-2">
          RPM Trend
        </p>
        <div className="flex items-center gap-2">
          <span className={cfg.color}>{cfg.icon}</span>
          <p className="text-sm text-zinc-500">{cfg.label}</p>
        </div>
      </div>
    );
  }

  // ── Normal ──
  const cfg = trendConfig[trend];

  return (
    <div className="relative rounded-xl border border-zinc-800 bg-zinc-900/80 p-5 overflow-hidden">
      {/* Accent bar */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${cfg.accent}`} />

      {/* Header with trend badge */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] uppercase tracking-wide text-zinc-500">
          RPM Trend (Running)
        </p>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cfg.color} bg-zinc-800`}
        >
          {cfg.icon}
          {deltaPctRunning !== null ? fmtDelta(deltaPctRunning) : cfg.label}
        </span>
      </div>

      {/* Side-by-side values */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] text-zinc-500 mb-0.5">{shortLabel}</p>
          <p className="text-2xl font-bold tabular-nums text-zinc-100">
            {shortAvgRpmRunning !== null ? fmtRpm(shortAvgRpmRunning) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] text-zinc-500 mb-0.5">{longLabel}</p>
          <p className="text-2xl font-bold tabular-nums text-zinc-100">
            {longAvgRpmRunning !== null ? fmtRpm(longAvgRpmRunning) : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
