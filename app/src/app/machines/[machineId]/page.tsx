"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState, useCallback, Suspense, useEffect, useMemo, useRef } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { useReadingsRealtime } from "@/app/hooks/useReadingsRealtime";
import MachineMetricsSummary from "@/app/components/analytics/MachineMetricsSummary";
import type { MetricsSummaryData } from "@/app/components/analytics/MachineMetricsSummary";
import MachineStateTimeline from "@/app/components/analytics/MachineStateTimeline";
import type { TimelineSegment } from "@/app/lib/analytics/types";
import ProvisionDeviceModal from "@/app/components/machines/ProvisionDeviceModal";
import RpmTrendComparisonCard from "@/app/components/analytics/RpmTrendComparisonCard";

type HistoryPoint = { ts_server: string; value: number };

type MetricsResponse = {
  machine_id: string;
  from: string;
  to: string;
  summary: MetricsSummaryData | null;
  timeline: TimelineSegment[];
  error?: string;
};

type HistoryResponse = {
  machine_id: string;
  metric: string;
  from: string;
  to: string;
  points: HistoryPoint[];
  total_points?: number;
  returned_points?: number;
  downsampled?: boolean;
  error?: string;
};

const fetcher = (url: string) =>
  fetch(url, { cache: "no-store" }).then(async (r) => {
    const json = await r.json();
    if (!r.ok) {
      const err = new Error(json.error ?? `HTTP ${r.status}`);
      (err as Error & { status: number }).status = r.status;
      throw err;
    }
    return json;
  });

const TIME_RANGES = [
  { label: "15m", minutes: 15 },
  { label: "1h", minutes: 60 },
  { label: "6h", minutes: 360 },
  { label: "1d", minutes: 1440 },
  { label: "1w", minutes: 10080 },
] as const;

type RpmTrendResponse = {
  machine_id: string;
  to: string;
  short_window: { avg_rpm_running: number; avg_rpm_all: number; rotations_total: number; runtime_hours: number };
  long_window: { avg_rpm_running: number; avg_rpm_all: number; rotations_total: number; runtime_hours: number };
  delta_pct_running: number | null;
  trend: "up" | "flat" | "down" | "insufficient_data";
  error?: string;
};

const FRESHNESS_SECONDS = 120; // Match server config

function formatValue(value: number | null, metric: string): string {
  if (value === null) return "—";
  const units: Record<string, string> = {
    rpm: " RPM",
    temperature: "°C",
    vibration: " mm/s",
    amps: " A",
  };
  return `${value.toFixed(1)}${units[metric] ?? ""}`;
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatFullTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString([], { 
    month: "short", 
    day: "numeric",
    hour: "2-digit", 
    minute: "2-digit", 
    second: "2-digit" 
  });
}

function isDataFresh(ts: string | null): boolean {
  if (!ts) return false;
  const d = new Date(ts);
  const now = new Date();
  return (now.getTime() - d.getTime()) < FRESHNESS_SECONDS * 1000;
}

// Tooltip component for charts
function ChartTooltip({ 
  x, 
  y, 
  value, 
  timestamp, 
  metric,
  chartWidth 
}: { 
  x: number; 
  y: number; 
  value: number; 
  timestamp: string; 
  metric: string;
  chartWidth: number;
}) {
  const units: Record<string, string> = {
    rpm: " RPM",
    temperature: "°C",
    vibration: " mm/s",
    amps: " A",
  };
  
  const tooltipWidth = 140;
  const tooltipHeight = 50;
  const minTopMargin = 10;
  
  // Adjust horizontal position to keep tooltip in view
  let tooltipX = x - tooltipWidth / 2;
  if (tooltipX < 10) tooltipX = 10;
  if (tooltipX + tooltipWidth > chartWidth - 10) tooltipX = chartWidth - tooltipWidth - 10;
  
  // Check if tooltip would be cut off at top - if so, show below the point
  const showBelow = y - tooltipHeight - 15 < minTopMargin;
  const tooltipY = showBelow ? y + 15 : y - tooltipHeight - 15;
  
  // Arrow points up when tooltip is below, down when tooltip is above
  const arrowPoints = showBelow
    ? `${x - 6},${tooltipY} ${x + 6},${tooltipY} ${x},${tooltipY - 8}`
    : `${x - 6},${tooltipY + tooltipHeight} ${x + 6},${tooltipY + tooltipHeight} ${x},${tooltipY + tooltipHeight + 8}`;
  
  return (
    <g className="pointer-events-none">
      {/* Tooltip background */}
      <rect
        x={tooltipX}
        y={tooltipY}
        width={tooltipWidth}
        height={tooltipHeight}
        rx={6}
        className="fill-zinc-900 dark:fill-zinc-100"
        filter="drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))"
      />
      {/* Arrow */}
      <polygon
        points={arrowPoints}
        className="fill-zinc-900 dark:fill-zinc-100"
      />
      {/* Value text */}
      <text
        x={tooltipX + tooltipWidth / 2}
        y={tooltipY + 20}
        textAnchor="middle"
        className="fill-white dark:fill-zinc-900 text-[13px] font-semibold"
      >
        {value.toFixed(1)}{units[metric] ?? ""}
      </text>
      {/* Timestamp text */}
      <text
        x={tooltipX + tooltipWidth / 2}
        y={tooltipY + 38}
        textAnchor="middle"
        className="fill-zinc-400 dark:fill-zinc-500 text-[10px]"
      >
        {formatFullTimestamp(timestamp)}
      </text>
    </g>
  );
}

// Chart that shows readings by index (last N readings)
function ReadingsChart({ points, metric }: { points: HistoryPoint[]; metric: string }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
  const width = 700;
  const height = 250;
  const padding = { top: 30, right: 30, bottom: 40, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Show last 50 readings max
  const displayPoints = points.slice(-50);

  if (displayPoints.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-zinc-400 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg">
        <div className="text-center">
          <p>No data available</p>
          <p className="text-xs mt-1">Waiting for readings...</p>
        </div>
      </div>
    );
  }

  const values = displayPoints.map((p) => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  
  // Add 10% padding to value range
  const valuePadding = (maxVal - minVal) * 0.1 || maxVal * 0.1 || 1;
  const yMin = Math.max(0, minVal - valuePadding);
  const yMax = maxVal + valuePadding;
  const yRange = yMax - yMin || 1;

  // Scale functions - X is by index, Y is by value
  const scaleX = (idx: number) => padding.left + (idx / Math.max(displayPoints.length - 1, 1)) * chartW;
  const scaleY = (val: number) => padding.top + chartH - ((val - yMin) / yRange) * chartH;

  // Create path
  const pathPoints = displayPoints.map((p, i) => {
    const x = scaleX(i);
    const y = scaleY(p.value);
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");

  // Create area fill path
  const areaPath = displayPoints.length > 0 
    ? `${pathPoints} L ${scaleX(displayPoints.length - 1).toFixed(1)} ${(padding.top + chartH).toFixed(1)} L ${scaleX(0).toFixed(1)} ${(padding.top + chartH).toFixed(1)} Z`
    : "";

  const units: Record<string, string> = {
    rpm: "RPM",
    temperature: "°C",
    vibration: "mm/s",
    amps: "A",
  };

  // Generate value labels
  const valueLabels = [0, 0.25, 0.5, 0.75, 1].map((pct) => {
    const val = yMin + yRange * pct;
    return {
      y: padding.top + chartH * (1 - pct),
      label: val.toFixed(0),
    };
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto"
      preserveAspectRatio="xMidYMid meet"
      onMouseLeave={() => setHoveredIndex(null)}
    >
      {/* Grid lines */}
      {valueLabels.map((vl, i) => (
        <g key={`grid-${i}`}>
          <line
            x1={padding.left}
            y1={vl.y}
            x2={padding.left + chartW}
            y2={vl.y}
            stroke="currentColor"
            className="text-zinc-100 dark:text-zinc-800"
          />
          <text
            x={padding.left - 10}
            y={vl.y + 4}
            textAnchor="end"
            className="fill-zinc-400 text-[11px]"
          >
            {vl.label}
          </text>
        </g>
      ))}

      {/* Y axis label */}
      <text
        x={16}
        y={padding.top + chartH / 2}
        textAnchor="middle"
        className="fill-zinc-500 text-[11px] font-medium"
        transform={`rotate(-90, 16, ${padding.top + chartH / 2})`}
      >
        {units[metric] ?? metric}
      </text>

      {/* Area fill */}
      {areaPath && (
        <path
          d={areaPath}
          className="fill-emerald-500/10"
        />
      )}

      {/* Line path */}
      <path
        d={pathPoints}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-emerald-500"
      />

      {/* Interactive data points */}
      {displayPoints.map((p, i) => {
        const x = scaleX(i);
        const y = scaleY(p.value);
        const isHovered = hoveredIndex === i;
        const isLatest = i === displayPoints.length - 1;
        
        return (
          <g key={i}>
            {/* Invisible larger hit area */}
            <circle
              cx={x}
              cy={y}
              r={12}
              className="fill-transparent cursor-pointer"
              onMouseEnter={() => setHoveredIndex(i)}
            />
            {/* Visible point */}
            <circle
              cx={x}
              cy={y}
              r={isHovered ? 6 : isLatest ? 6 : 4}
              className={`transition-all duration-150 ${
                isHovered 
                  ? "fill-emerald-400 stroke-emerald-600" 
                  : isLatest 
                    ? "fill-emerald-400 stroke-emerald-600"
                    : "fill-emerald-500 stroke-white dark:stroke-zinc-900"
              }`}
              strokeWidth={2}
              style={{ pointerEvents: 'none' }}
            />
          </g>
        );
      })}

      {/* Tooltip */}
      {hoveredIndex !== null && displayPoints[hoveredIndex] && (
        <ChartTooltip
          x={scaleX(hoveredIndex)}
          y={scaleY(displayPoints[hoveredIndex].value)}
          value={displayPoints[hoveredIndex].value}
          timestamp={displayPoints[hoveredIndex].ts_server}
          metric={metric}
          chartWidth={width}
        />
      )}

      {/* X axis labels - show reading numbers */}
      <text
        x={padding.left}
        y={height - 12}
        textAnchor="middle"
        className="fill-zinc-400 text-[11px]"
      >
        oldest
      </text>
      <text
        x={padding.left + chartW / 2}
        y={height - 12}
        textAnchor="middle"
        className="fill-zinc-400 text-[11px]"
      >
        {displayPoints.length} readings
      </text>
      <text
        x={padding.left + chartW}
        y={height - 12}
        textAnchor="middle"
        className="fill-zinc-400 text-[11px]"
      >
        latest
      </text>
    </svg>
  );
}

// Time-based chart (original, improved)
function TimeChart({ points, metric, fromIso, toIso }: { points: HistoryPoint[]; metric: string; fromIso: string; toIso: string }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  
  const width = 700;
  const height = 250;
  const padding = { top: 30, right: 30, bottom: 40, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  if (points.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-zinc-400 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg">
        <div className="text-center">
          <p>No data for this time range</p>
          <p className="text-xs mt-1">Waiting for readings...</p>
        </div>
      </div>
    );
  }

  // Use the passed time-window bounds (no Date.now() in render)
  const windowStart = new Date(fromIso).getTime();
  const windowEnd = new Date(toIso).getTime();

  const values = points.map((p) => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  
  const valuePadding = (maxVal - minVal) * 0.1 || maxVal * 0.1 || 1;
  const yMin = Math.max(0, minVal - valuePadding);
  const yMax = maxVal + valuePadding;
  const yRange = yMax - yMin || 1;

  const timestamps = points.map((p) => new Date(p.ts_server).getTime());

  const scaleX = (ts: number) => padding.left + ((ts - windowStart) / (windowEnd - windowStart)) * chartW;
  const scaleY = (val: number) => padding.top + chartH - ((val - yMin) / yRange) * chartH;

  const pathPoints = points.map((p, i) => {
    const x = scaleX(timestamps[i]);
    const y = scaleY(p.value);
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");

  const areaPath = points.length > 0 
    ? `${pathPoints} L ${scaleX(timestamps[timestamps.length - 1]).toFixed(1)} ${(padding.top + chartH).toFixed(1)} L ${scaleX(timestamps[0]).toFixed(1)} ${(padding.top + chartH).toFixed(1)} Z`
    : "";

  const units: Record<string, string> = {
    rpm: "RPM",
    temperature: "°C",
    vibration: "mm/s",
    amps: "A",
  };

  const timeLabels = [0, 0.5, 1].map((pct) => {
    const ts = new Date(windowStart + (windowEnd - windowStart) * pct);
    return {
      x: padding.left + chartW * pct,
      label: ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
  });

  const valueLabels = [0, 0.25, 0.5, 0.75, 1].map((pct) => {
    const val = yMin + yRange * pct;
    return {
      y: padding.top + chartH * (1 - pct),
      label: val.toFixed(0),
    };
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto"
      preserveAspectRatio="xMidYMid meet"
      onMouseLeave={() => setHoveredIndex(null)}
    >
      {valueLabels.map((vl, i) => (
        <g key={`grid-${i}`}>
          <line
            x1={padding.left}
            y1={vl.y}
            x2={padding.left + chartW}
            y2={vl.y}
            stroke="currentColor"
            className="text-zinc-100 dark:text-zinc-800"
          />
          <text
            x={padding.left - 10}
            y={vl.y + 4}
            textAnchor="end"
            className="fill-zinc-400 text-[11px]"
          >
            {vl.label}
          </text>
        </g>
      ))}

      <text
        x={16}
        y={padding.top + chartH / 2}
        textAnchor="middle"
        className="fill-zinc-500 text-[11px] font-medium"
        transform={`rotate(-90, 16, ${padding.top + chartH / 2})`}
      >
        {units[metric] ?? metric}
      </text>

      {areaPath && <path d={areaPath} className="fill-emerald-500/10" />}

      <path
        d={pathPoints}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-emerald-500"
      />

      {/* Interactive data points */}
      {points.map((p, i) => {
        const x = scaleX(timestamps[i]);
        const y = scaleY(p.value);
        const isHovered = hoveredIndex === i;
        const isLatest = i === points.length - 1;
        
        return (
          <g key={i}>
            {/* Invisible larger hit area */}
            <circle
              cx={x}
              cy={y}
              r={12}
              className="fill-transparent cursor-pointer"
              onMouseEnter={() => setHoveredIndex(i)}
            />
            {/* Visible point */}
            <circle
              cx={x}
              cy={y}
              r={isHovered ? 6 : isLatest ? 6 : 4}
              className={`transition-all duration-150 ${
                isHovered 
                  ? "fill-emerald-400 stroke-emerald-600" 
                  : isLatest 
                    ? "fill-emerald-400 stroke-emerald-600"
                    : "fill-emerald-500 stroke-white dark:stroke-zinc-900"
              }`}
              strokeWidth={2}
              style={{ pointerEvents: 'none' }}
            />
          </g>
        );
      })}

      {/* Tooltip */}
      {hoveredIndex !== null && points[hoveredIndex] && (
        <ChartTooltip
          x={scaleX(timestamps[hoveredIndex])}
          y={scaleY(points[hoveredIndex].value)}
          value={points[hoveredIndex].value}
          timestamp={points[hoveredIndex].ts_server}
          metric={metric}
          chartWidth={width}
        />
      )}

      {timeLabels.map((tl, i) => (
        <text
          key={`time-${i}`}
          x={tl.x}
          y={height - 12}
          textAnchor="middle"
          className="fill-zinc-400 text-[11px]"
        >
          {tl.label}
        </text>
      ))}
    </svg>
  );
}

function MachineDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const machineId = params.machineId as string;
  const plantId = searchParams.get("plantId");

  const [rangeMinutes, setRangeMinutes] = useState(15);
  const [chartMode, setChartMode] = useState<"time" | "readings">("readings");
  const [refreshTick, setRefreshTick] = useState(0);
  const [windowBaseMs] = useState(() => Date.now());
  const [provisionOpen, setProvisionOpen] = useState(false);

  // ── Custom range mode ──
  const [isCustomRange, setIsCustomRange] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [appliedCustomFrom, setAppliedCustomFrom] = useState<string | null>(null);
  const [appliedCustomTo, setAppliedCustomTo] = useState<string | null>(null);

  // Keep bounds stable between refresh ticks to avoid SWR key churn on every render.
  const windowAnchorMs = windowBaseMs + refreshTick * 5000;
  const { from, to } = useMemo(() => {
    if (isCustomRange && appliedCustomFrom && appliedCustomTo) {
      return {
        from: new Date(appliedCustomFrom).toISOString(),
        to: new Date(appliedCustomTo).toISOString(),
      };
    }
    return {
      from: new Date(windowAnchorMs - rangeMinutes * 60 * 1000).toISOString(),
      to: new Date(windowAnchorMs).toISOString(),
    };
  }, [windowAnchorMs, rangeMinutes, isCustomRange, appliedCustomFrom, appliedCustomTo]);

  // Whether this is a live auto-rolling window (not custom)
  const isLiveWindow = !isCustomRange;

  // Downsample long ranges for chart readability
  const maxPoints = rangeMinutes <= 60 ? 600 : rangeMinutes <= 1440 ? 1200 : 1600;

  const swrKey = `/api/machines/${machineId}/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&max_points=${maxPoints}`;

  const { data, error, isLoading } = useSWR<HistoryResponse>(swrKey, fetcher, {
    refreshInterval: isLiveWindow ? 5000 : 0,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    keepPreviousData: true,
    dedupingInterval: 0,
  });

  // ── Metrics SWR (summary + timeline) — same time range ──
  const metricsKey = `/api/machines/${machineId}/metrics?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  const {
    data: metricsData,
    error: metricsError,
    isLoading: metricsLoading,
  } = useSWR<MetricsResponse>(metricsKey, fetcher, {
    refreshInterval: isLiveWindow ? 5000 : 0,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    keepPreviousData: true,
    dedupingInterval: 0,
  });

  // ── RPM Trend SWR ──
  const rpmTrendKey = `/api/machines/${machineId}/rpm-trend?to=${encodeURIComponent(to)}`;

  const {
    data: rpmTrendData,
    error: rpmTrendError,
    isLoading: rpmTrendLoading,
  } = useSWR<RpmTrendResponse>(rpmTrendKey, fetcher, {
    refreshInterval: isLiveWindow ? 10_000 : 0,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

  // Force time bounds to update on each poll (only for preset/live mode)
  useEffect(() => {
    if (!isLiveWindow) return;
    const interval = setInterval(() => {
      setRefreshTick(t => t + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, [isLiveWindow]);

  // Throttled realtime revalidation to reduce per-second UI blinking
  const lastHistoryMutateRef = useRef(0);
  const lastMetricsMutateRef = useRef(0);

  const onInsert = useCallback(() => {
    const now = Date.now();

    // History: at most every ~2s
    if (now - lastHistoryMutateRef.current >= 2000) {
      lastHistoryMutateRef.current = now;
      mutate(swrKey);
    }

    // Metrics + timeline + RPM trend: at most every ~5s
    if (now - lastMetricsMutateRef.current >= 5000) {
      lastMetricsMutateRef.current = now;
      mutate(metricsKey);
      mutate(rpmTrendKey);
      if (plantId) {
        mutate(`/api/plants/${plantId}/cards`);
      }
    }
  }, [swrKey, metricsKey, rpmTrendKey, plantId]);

  const realtimeStatus = useReadingsRealtime(machineId, onInsert);

  // ── Unauthorized / not found ──
  const httpStatus = (error as Error & { status?: number })?.status;

  if (httpStatus === 401) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-black text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-zinc-200">Unauthorized</h2>
        <p className="text-sm text-zinc-500 max-w-sm">
          You don&apos;t have access to this machine. It may belong to a different company.
        </p>
        <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors mt-2">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  if (httpStatus === 404) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-black text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-zinc-200">Machine not found</h2>
        <p className="text-sm text-zinc-500 max-w-sm">
          This machine doesn&apos;t exist or you don&apos;t have access.
        </p>
        <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors mt-2">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const latestPoint = data?.points?.length ? data.points[data.points.length - 1] : null;
  const currentTs = latestPoint?.ts_server ?? null;
  const isFresh = isDataFresh(currentTs);
  const showMetricsSkeleton = metricsLoading && !metricsData;
  
  // Show 0 when data is stale (stopped), otherwise show latest value
  const displayValue = isFresh ? (latestPoint?.value ?? null) : 0;
  const pointCount = data?.points?.length ?? 0;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link
            href={plantId ? `/plants/${plantId}` : "/"}
            className="p-2 -ml-2 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold">Machine Detail</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
              {data?.metric?.toUpperCase() ?? "Loading..."} • Live
            </p>
          </div>

          {/* Provision device button */}
          <button
            type="button"
            onClick={() => setProvisionOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Provision device
          </button>

          {/* Realtime status chip */}
          {realtimeStatus === "connected" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Connected
            </span>
          ) : realtimeStatus === "connecting" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              Reconnecting
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-700" title="Realtime unavailable — data updates via polling every 5s">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
              Polling fallback
            </span>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Current value - prominent display */}
        <div className={`rounded-2xl border bg-white dark:bg-zinc-900 p-8 mb-6 transition-colors ${
          isFresh 
            ? "border-zinc-200 dark:border-zinc-800" 
            : "border-amber-300 dark:border-amber-700"
        }`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                  Current Value
                </p>
                {!isFresh && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Stopped
                  </span>
                )}
              </div>
              {isLoading && !data ? (
                <div className="animate-pulse h-16 bg-zinc-100 dark:bg-zinc-800 rounded mt-3 w-48" />
              ) : error || data?.error ? (
                <p className="text-red-500 mt-3">Error: {data?.error ?? String(error)}</p>
              ) : (
                <p className={`text-6xl font-bold tabular-nums mt-2 tracking-tight ${
                  isFresh ? "" : "text-zinc-400 dark:text-zinc-600"
                }`}>
                  {formatValue(displayValue, data?.metric ?? "")}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                Last reading
              </p>
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300 mt-1">
                {formatTimestamp(currentTs)}
              </p>
              <p className="text-xs text-zinc-400 mt-2">
                {pointCount} readings in range
              </p>
            </div>
          </div>
        </div>

        {/* Metrics Summary */}
        <div className="mb-6">
          <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-300 mb-1">
            Performance Summary
          </h2>
          <p className="text-[11px] text-zinc-500 mb-3">
            Stitches/rotations are exact device revolution totals when available. RPM is derived server-side from counter windows.
          </p>
          <MachineMetricsSummary
            data={metricsData?.summary ?? null}
            isLoading={showMetricsSkeleton}
            error={metricsError ? (metricsError as Error).message : (metricsData?.error ?? null)}
          />
        </div>

        {/* RPM Trend Comparison */}
        <div className="mb-6">
          <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-300 mb-3">
            RPM Trend
          </h2>
          <RpmTrendComparisonCard
            shortAvgRpmRunning={rpmTrendData?.short_window.avg_rpm_running ?? null}
            longAvgRpmRunning={rpmTrendData?.long_window.avg_rpm_running ?? null}
            deltaPctRunning={rpmTrendData?.delta_pct_running ?? null}
            trend={rpmTrendData?.trend ?? "insufficient_data"}
            isLoading={rpmTrendLoading && !rpmTrendData}
            error={rpmTrendError ? (rpmTrendError as Error).message : (rpmTrendData?.error ?? null)}
            shortLabel="1 hr"
            longLabel="7 day"
          />
        </div>

        {/* State Timeline */}
        <div className="mb-6">
          <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-300 mb-3">
            Machine State
          </h2>
          {showMetricsSkeleton ? (
            <div className="h-8 rounded-md bg-zinc-800 animate-pulse" />
          ) : metricsError || metricsData?.error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
              Failed to load timeline
            </div>
          ) : (metricsData?.timeline?.length ?? 0) > 0 ? (
            <MachineStateTimeline
              segments={metricsData!.timeline}
              from={from}
              to={to}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-3 text-center text-sm text-zinc-500">
              No state data for this time range.
            </div>
          )}
        </div>

        {/* Chart controls */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
              {data?.metric?.toUpperCase() ?? "Metric"} over time
            </h2>
            {/* Chart mode toggle */}
            <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-0.5 rounded-md ml-2">
              <button
                onClick={() => setChartMode("readings")}
                className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                  chartMode === "readings"
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                Readings
              </button>
              <button
                onClick={() => setChartMode("time")}
                className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                  chartMode === "time"
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                    : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                Timeline
              </button>
            </div>
          </div>

          {/* Time range selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
              {TIME_RANGES.map((r) => (
                <button
                  key={r.label}
                  onClick={() => {
                    setIsCustomRange(false);
                    setRangeMinutes(r.minutes);
                    setRefreshTick(t => t + 1);
                  }}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    !isCustomRange && rangeMinutes === r.minutes
                      ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  }`}
                >
                  {r.label}
                </button>
              ))}
              <button
                onClick={() => setIsCustomRange(true)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  isCustomRange
                    ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                }`}
              >
                Custom
              </button>
            </div>
          </div>
        </div>

        {/* Custom range inputs */}
        {isCustomRange && (
          <div className="flex items-end gap-2 mb-4 flex-wrap">
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">From</label>
              <input
                type="datetime-local"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-800/60 px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-colors [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-500 mb-1">To</label>
              <input
                type="datetime-local"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-800/60 px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-colors [color-scheme:dark]"
              />
            </div>
            <button
              onClick={() => {
                if (customFrom && customTo) {
                  setAppliedCustomFrom(customFrom);
                  setAppliedCustomTo(customTo);
                }
              }}
              disabled={!customFrom || !customTo}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Apply
            </button>
          </div>
        )}

        {/* Chart */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          {isLoading && !data ? (
            <div className="animate-pulse h-64 bg-zinc-100 dark:bg-zinc-800 rounded-lg" />
          ) : chartMode === "readings" ? (
            <ReadingsChart points={data?.points ?? []} metric={data?.metric ?? ""} />
          ) : (
            <TimeChart
              points={data?.points ?? []}
              metric={data?.metric ?? ""}
              fromIso={from}
              toIso={to}
            />
          )}
        </div>
        
        {/* Hover hint */}
        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-2 text-center">
          {data?.downsampled
            ? `Showing ${data.returned_points?.toLocaleString() ?? ""} sampled points of ${data.total_points?.toLocaleString() ?? ""} for readability`
            : "Hover over data points to see exact values"}
        </p>
      </main>

      <ProvisionDeviceModal
        open={provisionOpen}
        machineId={machineId}
        onClose={() => setProvisionOpen(false)}
      />
    </div>
  );
}

export default function MachineDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="animate-pulse text-zinc-500">Loading...</div>
      </div>
    }>
      <MachineDetailContent />
    </Suspense>
  );
}
