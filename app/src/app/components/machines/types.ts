// ── Machine domain types & validation helpers ──

export type PrimaryMetric = "rpm" | "temperature" | "vibration" | "amps";

export const PRIMARY_METRICS: readonly PrimaryMetric[] = [
  "rpm",
  "temperature",
  "vibration",
  "amps",
] as const;

/** Input shape for creating / editing a machine. */
export type MachineFormInput = {
  name: string;
  line: string;
  primaryMetric: PrimaryMetric;
};

/** Row returned when listing machine groups for a company. */
export type MachineGroup = {
  id: string;
  companyId: string;
  name: string;
  createdAt: string;
};

// ── Validation helpers ──

/** Max lengths (bytes in Postgres `text` are unbounded, but we cap in the UI). */
const MAX_NAME_LENGTH = 100;
const MAX_LINE_LENGTH = 100;

export function trimmedName(raw: string): string {
  return raw.trim().slice(0, MAX_NAME_LENGTH);
}

export function trimmedLine(raw: string): string {
  return raw.trim().slice(0, MAX_LINE_LENGTH);
}

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

export function isPrimaryMetric(value: string): value is PrimaryMetric {
  return (PRIMARY_METRICS as readonly string[]).includes(value);
}
