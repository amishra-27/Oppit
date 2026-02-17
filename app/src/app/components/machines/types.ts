// ── Machine domain types & validation helpers ──

export type PrimaryMetric = "rpm" | "temperature" | "vibration" | "amps";

export const PRIMARY_METRICS: readonly PrimaryMetric[] = [
  "rpm",
  "temperature",
  "vibration",
  "amps",
] as const;

/** Human-readable labels for each metric (shared across forms). */
export const METRIC_LABELS: Record<PrimaryMetric, string> = {
  rpm: "RPM",
  temperature: "Temperature (°C)",
  vibration: "Vibration (mm/s)",
  amps: "Amps (A)",
};

/** Input shape for creating / editing a machine. */
export type MachineFormInput = {
  name: string;
  line: string;
  primaryMetric: PrimaryMetric;
};

/**
 * Payload shape for PATCH /api/machines/[machineId].
 * All fields optional — only include what changed.
 */
export type EditMachinePayload = {
  name?: string;
  line?: string | null;
  primary_metric?: PrimaryMetric;
  group_id?: string | null;
};

/** Row returned when listing machine groups for a company. */
export type MachineGroup = {
  id: string;
  companyId: string;
  name: string;
  createdAt: string;
};

// ── Normalization / trim helpers ──

/** Max lengths (bytes in Postgres `text` are unbounded, but we cap in the UI). */
export const MAX_NAME_LENGTH = 100;
export const MAX_LINE_LENGTH = 100;

/** Trim and cap a machine name to MAX_NAME_LENGTH. */
export function trimmedName(raw: string): string {
  return raw.trim().slice(0, MAX_NAME_LENGTH);
}

/** Trim and cap a line/station string to MAX_LINE_LENGTH. */
export function trimmedLine(raw: string): string {
  return raw.trim().slice(0, MAX_LINE_LENGTH);
}

/**
 * Normalize a line value for API submission.
 * Returns trimmed string or null if empty (matches DB convention).
 */
export function normalizedLine(raw: string): string | null {
  const t = trimmedLine(raw);
  return t.length > 0 ? t : null;
}

// ── Validation helpers ──

export function validateMachineName(raw: string): string | null {
  const name = trimmedName(raw);
  if (name.length === 0) return "Machine name is required";
  if (name.length < 2) return "Machine name must be at least 2 characters";
  return null;
}

export function validateLine(raw: string): string | null {
  // Line is optional — only validate length if provided
  const line = trimmedLine(raw);
  if (line.length > 0 && line.length < 2)
    return "Line must be at least 2 characters if provided";
  return null;
}

/** Type guard: returns true if `value` is a known PrimaryMetric. */
export function isPrimaryMetric(value: string): value is PrimaryMetric {
  return (PRIMARY_METRICS as readonly string[]).includes(value);
}

/**
 * Validate a primary metric string. Returns error message or null.
 * Useful when accepting user input that may not be typed as PrimaryMetric.
 */
export function validatePrimaryMetric(value: string): string | null {
  if (!value) return "Primary metric is required";
  if (!isPrimaryMetric(value))
    return `Invalid metric. Must be one of: ${PRIMARY_METRICS.join(", ")}`;
  return null;
}
