"use client";

// ── Types ──

export type MetricsSummaryData = {
  /** Total rotations (sum of rpm readings × interval). */
  rotationsTotal: number;
  /** Utilization as a fraction 0–1 (runtime / total time in range). */
  utilization: number;
  /** Total hours the machine was running. */
  runtimeHours: number;
  /** Number of distinct stop events (transitions from running → stopped). */
  stopCount: number;
  /** Average stop duration in seconds. */
  avgStopDurationSec: number;
};

interface MachineMetricsSummaryProps {
  data: MetricsSummaryData | null;
  isLoading: boolean;
  error: string | null;
}

// ── Formatting helpers ──

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtPercent(frac: number): string {
  return `${(frac * 100).toFixed(1)}%`;
}

function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
}

function fmtDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Tile subcomponent ──

function Tile({
  label,
  value,
  subtitle,
  accent,
}: {
  label: string;
  value: string;
  subtitle?: string;
  accent?: "emerald" | "amber" | "red" | "cyan" | "zinc";
}) {
  const accentBar: Record<string, string> = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    cyan: "bg-cyan-500",
    zinc: "bg-zinc-600",
  };

  return (
    <div className="relative rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 overflow-hidden">
      {/* Accent top bar */}
      {accent && (
        <div
          className={`absolute top-0 left-0 right-0 h-0.5 ${accentBar[accent]}`}
        />
      )}
      <p className="text-[11px] uppercase tracking-wide text-zinc-500 mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold tabular-nums text-zinc-100">{value}</p>
      {subtitle && (
        <p className="text-[11px] text-zinc-500 mt-1">{subtitle}</p>
      )}
    </div>
  );
}

// ── Loading skeleton ──

function Skeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 animate-pulse"
        >
          <div className="h-3 w-16 bg-zinc-800 rounded mb-2" />
          <div className="h-7 w-20 bg-zinc-800 rounded" />
        </div>
      ))}
    </div>
  );
}

// ── Main component ──

export default function MachineMetricsSummary({
  data,
  isLoading,
  error,
}: MachineMetricsSummaryProps) {
  if (isLoading) return <Skeleton />;

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <p className="text-sm text-red-400">
          Failed to load metrics: {error}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center">
        <p className="text-sm text-zinc-500">
          No metric data available for this time range.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <Tile
        label="Rotations"
        value={fmtNumber(data.rotationsTotal)}
        subtitle="Total in range"
        accent="cyan"
      />
      <Tile
        label="Utilization"
        value={fmtPercent(data.utilization)}
        subtitle="Runtime / total"
        accent="emerald"
      />
      <Tile
        label="Runtime"
        value={fmtHours(data.runtimeHours)}
        subtitle="Total running"
        accent="emerald"
      />
      <Tile
        label="Stops"
        value={String(data.stopCount)}
        subtitle={data.stopCount === 1 ? "1 event" : `${data.stopCount} events`}
        accent={data.stopCount > 0 ? "amber" : "zinc"}
      />
      <Tile
        label="Avg Stop"
        value={data.stopCount > 0 ? fmtDuration(data.avgStopDurationSec) : "—"}
        subtitle="Mean downtime"
        accent={data.stopCount > 0 ? "red" : "zinc"}
      />
    </div>
  );
}
