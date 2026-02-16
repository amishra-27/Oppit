"use client";

import { useState } from "react";
import type { TimelineSegment, TimelineStatus } from "@/app/lib/analytics/types";

// ── Helpers ──

function formatDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_CONFIG: Record<
  TimelineStatus,
  { bg: string; border: string; text: string; label: string }
> = {
  running: {
    bg: "bg-emerald-500/20",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
    label: "Running",
  },
  stopped: {
    bg: "bg-zinc-500/20",
    border: "border-zinc-600/30",
    text: "text-zinc-400",
    label: "Stopped",
  },
  stale: {
    bg: "bg-amber-500/20",
    border: "border-amber-500/30",
    text: "text-amber-400",
    label: "Stale",
  },
  no_data: {
    bg: "bg-zinc-800/40",
    border: "border-zinc-700/30",
    text: "text-zinc-600",
    label: "No data",
  },
};

// ── Tooltip ──

function Tooltip({
  segment,
  anchorRect,
  containerRect,
}: {
  segment: TimelineSegment;
  anchorRect: DOMRect;
  containerRect: DOMRect;
}) {
  const cfg = STATUS_CONFIG[segment.status];

  // Position tooltip centered above the hovered segment
  const left = anchorRect.left - containerRect.left + anchorRect.width / 2;
  const top = anchorRect.top - containerRect.top - 8;

  return (
    <div
      className="absolute z-20 pointer-events-none -translate-x-1/2 -translate-y-full"
      style={{ left, top }}
    >
      <div className="rounded-lg bg-zinc-900 border border-zinc-700 shadow-xl px-3 py-2 text-xs whitespace-nowrap">
        <p className="font-semibold text-zinc-200 mb-1">{segment.machineName}</p>
        <div className="flex items-center gap-1.5 mb-1">
          <span
            className={`inline-block w-2 h-2 rounded-full ${cfg.bg} border ${cfg.border}`}
          />
          <span className={cfg.text}>{cfg.label}</span>
          <span className="text-zinc-500 ml-1">
            {formatDuration(segment.durationSec)}
          </span>
        </div>
        <p className="text-zinc-500">
          {formatTime(segment.from)} — {formatTime(segment.to)}
        </p>
      </div>
      {/* Arrow */}
      <div className="flex justify-center">
        <div className="w-2 h-2 bg-zinc-900 border-b border-r border-zinc-700 rotate-45 -mt-1" />
      </div>
    </div>
  );
}

// ── Main component ──

interface MachineStateTimelineProps {
  /** Segments for a single machine, ordered chronologically. */
  segments: TimelineSegment[];
  /** Overall time range start (ISO). Used to compute relative widths. */
  from: string;
  /** Overall time range end (ISO). */
  to: string;
  /** Optional: show machine name label to the left. Default true. */
  showLabel?: boolean;
}

export default function MachineStateTimeline({
  segments,
  from,
  to,
  showLabel = true,
}: MachineStateTimelineProps) {
  const [hovered, setHovered] = useState<{
    segment: TimelineSegment;
    rect: DOMRect;
  } | null>(null);
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);

  const rangeStart = new Date(from).getTime();
  const rangeEnd = new Date(to).getTime();
  const totalMs = rangeEnd - rangeStart;

  if (totalMs <= 0 || segments.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 text-center">
        <p className="text-xs text-zinc-500">No timeline data available.</p>
      </div>
    );
  }

  const machineName = segments[0]?.machineName ?? "Machine";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        {showLabel && (
          <span className="text-sm font-medium text-zinc-300 truncate max-w-[160px]">
            {machineName}
          </span>
        )}
        <div className="flex items-center gap-3 ml-auto">
          {(["running", "stopped", "stale", "no_data"] as TimelineStatus[]).map(
            (s) => {
              const cfg = STATUS_CONFIG[s];
              const hasStatus = segments.some((seg) => seg.status === s);
              if (!hasStatus) return null;
              return (
                <span
                  key={s}
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-500"
                >
                  <span
                    className={`w-2 h-2 rounded-full ${cfg.bg} border ${cfg.border}`}
                  />
                  {cfg.label}
                </span>
              );
            }
          )}
        </div>
      </div>

      {/* Timeline bar */}
      <div
        className="relative flex h-8 rounded-lg overflow-hidden bg-zinc-800/60"
        ref={(el) => {
          if (el && !containerRect) {
            setContainerRect(el.getBoundingClientRect());
          }
        }}
        onMouseLeave={() => setHovered(null)}
      >
        {segments.map((seg, i) => {
          const segStart = new Date(seg.from).getTime();
          const segEnd = new Date(seg.to).getTime();
          const widthPct = ((segEnd - segStart) / totalMs) * 100;
          const cfg = STATUS_CONFIG[seg.status];

          // Only show inline duration label if segment is wide enough
          const showInlineLabel = widthPct > 8;

          return (
            <div
              key={`${seg.machineId}-${i}`}
              className={`relative h-full ${cfg.bg} border-r ${cfg.border} last:border-r-0 transition-opacity hover:opacity-90 cursor-default flex items-center justify-center`}
              style={{ width: `${widthPct}%`, minWidth: widthPct > 0.5 ? 2 : 0 }}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const parent = e.currentTarget.parentElement?.getBoundingClientRect();
                if (parent) setContainerRect(parent);
                setHovered({ segment: seg, rect });
              }}
            >
              {showInlineLabel && (
                <span
                  className={`text-[10px] font-medium ${cfg.text} truncate px-1`}
                >
                  {formatDuration(seg.durationSec)}
                </span>
              )}
            </div>
          );
        })}

        {/* Tooltip */}
        {hovered && containerRect && (
          <Tooltip
            segment={hovered.segment}
            anchorRect={hovered.rect}
            containerRect={containerRect}
          />
        )}
      </div>

      {/* Time axis labels */}
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] text-zinc-600">{formatTime(from)}</span>
        <span className="text-[10px] text-zinc-600">{formatTime(to)}</span>
      </div>
    </div>
  );
}
