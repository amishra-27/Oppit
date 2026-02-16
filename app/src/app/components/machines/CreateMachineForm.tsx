"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  PRIMARY_METRICS,
  isPrimaryMetric,
  trimmedName,
  trimmedLine,
  validateMachineName,
  validateLine,
  type PrimaryMetric,
  type MachineGroup,
} from "./types";

/** Shape returned to the parent after a successful create. */
export type CreatedMachine = {
  id: string;
  name: string;
  line: string | null;
  primaryMetric: PrimaryMetric;
  groupId: string | null;
};

interface CreateMachineFormProps {
  plantId: string;
  activeCompanyId: string;
  groups: MachineGroup[];
  onCreated: (machine: CreatedMachine) => void;
}

const METRIC_LABELS: Record<PrimaryMetric, string> = {
  rpm: "RPM",
  temperature: "Temperature (°C)",
  vibration: "Vibration (mm/s)",
  amps: "Amps (A)",
};

type Toast = { type: "success" | "error"; message: string };

export default function CreateMachineForm({
  plantId,
  activeCompanyId,
  groups,
  onCreated,
}: CreateMachineFormProps) {
  const [name, setName] = useState("");
  const [line, setLine] = useState("");
  const [metric, setMetric] = useState<PrimaryMetric>("rpm");
  const [groupId, setGroupId] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // Field-level validation errors (shown on blur / submit)
  const [nameError, setNameError] = useState<string | null>(null);
  const [lineError, setLineError] = useState<string | null>(null);

  function clearToast() {
    setToast(null);
  }

  function validate(): boolean {
    const nErr = validateMachineName(name);
    const lErr = validateLine(line);
    setNameError(nErr);
    setLineError(lErr);
    return !nErr && !lErr;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearToast();

    if (!validate()) return;

    setLoading(true);

    const supabase = createClient();

    const machineName = trimmedName(name);
    const machineLine = trimmedLine(line) || null;

    // 1) Insert machine — trigger auto-sets company_id from plant
    const { data: machineRow, error: machineErr } = await supabase
      .from("machines")
      .insert({
        plant_id: plantId,
        name: machineName,
        line: machineLine,
        primary_metric: metric,
      })
      .select("id")
      .single();

    if (machineErr) {
      const msg =
        machineErr.code === "23505"
          ? "A machine with that name already exists in this plant."
          : machineErr.message;
      setToast({ type: "error", message: msg });
      setLoading(false);
      return;
    }

    const machineId: string = machineRow.id;
    let assignedGroupId: string | null = null;

    // 2) Optionally assign to group
    if (groupId) {
      const { error: linkErr } = await supabase
        .from("machine_group_machines")
        .insert({ group_id: groupId, machine_id: machineId });

      if (linkErr) {
        // Machine created but group link failed — surface warning, don't roll back
        setToast({
          type: "error",
          message: `Machine created but group assignment failed: ${linkErr.message}`,
        });
        setLoading(false);
        onCreated({
          id: machineId,
          name: machineName,
          line: machineLine,
          primaryMetric: metric,
          groupId: null,
        });
        return;
      }

      assignedGroupId = groupId;
    }

    // Success — reset form & notify parent
    setToast({ type: "success", message: `"${machineName}" created successfully.` });
    setName("");
    setLine("");
    setMetric("rpm");
    setGroupId("");
    setNameError(null);
    setLineError(null);
    setLoading(false);

    onCreated({
      id: machineId,
      name: machineName,
      line: machineLine,
      primaryMetric: metric,
      groupId: assignedGroupId,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* ── Toast ── */}
      {toast && (
        <div
          role="alert"
          className={`flex items-center justify-between rounded-lg px-4 py-3 text-sm ${
            toast.type === "success"
              ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
              : "bg-red-500/10 border border-red-500/20 text-red-400"
          }`}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={clearToast}
            className="ml-3 text-current opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Machine name ── */}
      <div>
        <label htmlFor="machine-name" className="block text-sm font-medium text-zinc-400 mb-1">
          Machine Name <span className="text-red-400">*</span>
        </label>
        <input
          id="machine-name"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(validateMachineName(e.target.value));
          }}
          onBlur={() => setNameError(validateMachineName(name))}
          placeholder="e.g. Machine 04"
          required
          maxLength={100}
          className={`w-full rounded-lg border bg-zinc-800/80 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-colors ${
            nameError ? "border-red-500/60" : "border-zinc-700 focus:border-emerald-500/40"
          }`}
        />
        {nameError && <p className="mt-1 text-xs text-red-400">{nameError}</p>}
      </div>

      {/* ── Station / Line ── */}
      <div>
        <label htmlFor="machine-line" className="block text-sm font-medium text-zinc-400 mb-1">
          Station / Line
        </label>
        <input
          id="machine-line"
          type="text"
          value={line}
          onChange={(e) => {
            setLine(e.target.value);
            if (lineError) setLineError(validateLine(e.target.value));
          }}
          onBlur={() => setLineError(validateLine(line))}
          placeholder="e.g. Line 1"
          maxLength={100}
          className={`w-full rounded-lg border bg-zinc-800/80 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-colors ${
            lineError ? "border-red-500/60" : "border-zinc-700 focus:border-emerald-500/40"
          }`}
        />
        {lineError && <p className="mt-1 text-xs text-red-400">{lineError}</p>}
      </div>

      {/* ── Primary metric ── */}
      <div>
        <label htmlFor="machine-metric" className="block text-sm font-medium text-zinc-400 mb-1">
          Primary Metric <span className="text-red-400">*</span>
        </label>
        <select
          id="machine-metric"
          value={metric}
          onChange={(e) => {
            if (isPrimaryMetric(e.target.value)) setMetric(e.target.value);
          }}
          className="w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-colors cursor-pointer"
        >
          {PRIMARY_METRICS.map((m) => (
            <option key={m} value={m}>
              {METRIC_LABELS[m]}
            </option>
          ))}
        </select>
      </div>

      {/* ── Group (optional) ── */}
      <div>
        <label htmlFor="machine-group" className="block text-sm font-medium text-zinc-400 mb-1">
          Group <span className="text-zinc-600">(optional)</span>
        </label>
        {groups.length === 0 ? (
          <p className="text-xs text-zinc-500">No groups yet — create one first.</p>
        ) : (
          <select
            id="machine-group"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-colors cursor-pointer"
          >
            <option value="">None</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── Submit ── */}
      <button
        type="submit"
        disabled={loading}
        className="mt-1 w-full rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {loading ? "Creating…" : "Create Machine"}
      </button>
    </form>
  );
}
