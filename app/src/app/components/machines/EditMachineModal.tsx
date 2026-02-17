"use client";

import { useEffect, useState } from "react";
import {
  PRIMARY_METRICS,
  METRIC_LABELS,
  isPrimaryMetric,
  trimmedName,
  normalizedLine,
  validateMachineName,
  validateLine,
  MAX_NAME_LENGTH,
  MAX_LINE_LENGTH,
  type PrimaryMetric,
  type EditMachinePayload,
} from "./types";

// ── Props ───────────────────────────────────────────────────────────────────

/** Minimal machine shape needed to populate the edit form. */
export interface EditableMachine {
  id: string;
  name: string;
  line?: string | null;
  primary_metric: string;
  group_id?: string | null;
}

export interface EditMachineModalProps {
  open: boolean;
  machine: EditableMachine | null;
  groups: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function EditMachineModal({
  open,
  machine,
  groups,
  onClose,
  onSaved,
}: EditMachineModalProps) {
  // ── Form state ──
  const [name, setName] = useState("");
  const [line, setLine] = useState("");
  const [metric, setMetric] = useState<PrimaryMetric>("rpm");
  const [groupId, setGroupId] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [lineError, setLineError] = useState<string | null>(null);

  // Reset form whenever a new machine is provided
  useEffect(() => {
    if (machine) {
      setName(machine.name);
      setLine(machine.line ?? "");
      setMetric(isPrimaryMetric(machine.primary_metric) ? machine.primary_metric : "rpm");
      setGroupId(machine.group_id ?? "");
      setError(null);
      setNameError(null);
      setLineError(null);
      setSaving(false);
    }
  }, [machine]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Don't render anything if closed or no machine
  if (!open || !machine) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const nErr = validateMachineName(name);
    const lErr = validateLine(line);
    setNameError(nErr);
    setLineError(lErr);
    if (nErr || lErr) return;

    setSaving(true);

    const payload: EditMachinePayload = {
      name: trimmedName(name),
      line: normalizedLine(line),
      primary_metric: metric,
      group_id: groupId || null,
    };

    try {
      const res = await fetch(`/api/machines/${machine!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border bg-zinc-800/80 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-colors";
  const selectCls =
    "w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-colors cursor-pointer";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Edit machine"
    >
      <div
        className="w-full max-w-md mx-4 rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-200">Edit Machine</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 -mr-1"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Machine name */}
          <div>
            <label htmlFor="edit-machine-name" className="block text-xs font-medium text-zinc-400 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              id="edit-machine-name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(validateMachineName(e.target.value));
              }}
              onBlur={() => setNameError(validateMachineName(name))}
              maxLength={MAX_NAME_LENGTH}
              required
              autoFocus
              className={`${inputCls} ${
                nameError ? "border-red-500/60" : "border-zinc-700 focus:border-emerald-500/40"
              }`}
            />
            {nameError && <p className="mt-1 text-xs text-red-400">{nameError}</p>}
          </div>

          {/* Station / Line */}
          <div>
            <label htmlFor="edit-machine-line" className="block text-xs font-medium text-zinc-400 mb-1">
              Station / Line
            </label>
            <input
              id="edit-machine-line"
              type="text"
              value={line}
              onChange={(e) => {
                setLine(e.target.value);
                if (lineError) setLineError(validateLine(e.target.value));
              }}
              onBlur={() => setLineError(validateLine(line))}
              maxLength={MAX_LINE_LENGTH}
              placeholder="e.g. Line 1"
              className={`${inputCls} ${
                lineError ? "border-red-500/60" : "border-zinc-700 focus:border-emerald-500/40"
              }`}
            />
            {lineError && <p className="mt-1 text-xs text-red-400">{lineError}</p>}
          </div>

          {/* Primary metric + Group (side by side) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="edit-machine-metric" className="block text-xs font-medium text-zinc-400 mb-1">
                Metric <span className="text-red-400">*</span>
              </label>
              <select
                id="edit-machine-metric"
                value={metric}
                onChange={(e) => {
                  if (isPrimaryMetric(e.target.value)) setMetric(e.target.value);
                }}
                className={selectCls}
              >
                {PRIMARY_METRICS.map((m) => (
                  <option key={m} value={m}>
                    {METRIC_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="edit-machine-group" className="block text-xs font-medium text-zinc-400 mb-1">
                Group
              </label>
              <select
                id="edit-machine-group"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className={selectCls}
              >
                <option value="">None</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4 text-red-400 shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
