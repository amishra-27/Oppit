// ── Analytics domain types ──
// Shared across dashboard charts, detail views, and any future analytics pages.

import type { PrimaryMetric } from "@/app/components/machines/types";

// ── Machine metric point & response ──

/** A single timestamped metric reading. */
export type MetricPoint = {
  ts_server: string;
  value: number;
};

/** Response shape from /api/machines/[machineId]/history. */
export type MachineMetricsResponse = {
  machine_id: string;
  metric: PrimaryMetric;
  from: string;
  to: string;
  points: MetricPoint[];
  error?: string;
};

// ── Timeline segments ──

export type TimelineStatus = "running" | "stopped" | "stale" | "no_data";

/**
 * A contiguous time segment where a machine held a single status.
 * Useful for rendering uptime/downtime bars on a timeline chart.
 */
export type TimelineSegment = {
  machineId: string;
  machineName: string;
  status: TimelineStatus;
  /** ISO start of segment (inclusive). */
  from: string;
  /** ISO end of segment (exclusive). */
  to: string;
  /** Duration in seconds. */
  durationSec: number;
};

/** Full timeline response for one or more machines over a time range. */
export type TimelineResponse = {
  plantId: string;
  from: string;
  to: string;
  segments: TimelineSegment[];
  error?: string;
};

// ── Plant daily metric rows ──

/**
 * Aggregated metric summary for a single machine on a single day.
 * Intended for plant-level daily roll-up tables and sparklines.
 */
export type PlantDailyMetricRow = {
  /** Calendar date in YYYY-MM-DD format. */
  date: string;
  machineId: string;
  machineName: string;
  metric: PrimaryMetric;
  /** Number of readings recorded that day. */
  readingCount: number;
  /** Aggregate statistics for the day. */
  min: number;
  max: number;
  avg: number;
  /** Latest reading value on that day (useful for "last known" display). */
  latest: number;
};

/** Response shape for a plant's daily metric summary. */
export type PlantDailyMetricsResponse = {
  plantId: string;
  from: string;
  to: string;
  rows: PlantDailyMetricRow[];
  error?: string;
};
