"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
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

// ── Local types ──────────────────────────────────────────────────────────────

type MachineRow = {
  id: string;
  name: string;
  line: string | null;
  primary_metric: string;
  group_id: string | null;
  group_name: string | null;
};

interface ManageMachinesListProps {
  plantId: string;
  groups: MachineGroup[];
  onChanged?: () => void;
}

type Toast = { type: "success" | "error"; message: string };

const METRIC_LABELS: Record<PrimaryMetric, string> = {
  rpm: "RPM",
  temperature: "Temperature (°C)",
  vibration: "Vibration (mm/s)",
  amps: "Amps (A)",
};

// ── Fetcher: machines for plant with group info ─────────────────────────────

async function fetchMachines(plantId: string): Promise<MachineRow[]> {
  const supabase = createClient();

  // Fetch machines + join through machine_group_machines → machine_groups
  const { data: machines, error: mErr } = await supabase
    .from("machines")
    .select("id, name, line, primary_metric")
    .eq("plant_id", plantId)
    .order("name");

  if (mErr) throw mErr;
  if (!machines) return [];

  // Fetch group links for these machines
  const machineIds = machines.map((m) => m.id);
  const { data: links } = await supabase
    .from("machine_group_machines")
    .select("machine_id, machine_groups(id, name)")
    .in("machine_id", machineIds);

  // Build a lookup: machine_id → { group_id, group_name }
  const groupMap = new Map<string, { group_id: string; group_name: string }>();
  for (const link of links ?? []) {
    const g = link.machine_groups as unknown as { id: string; name: string } | null;
    if (g) {
      groupMap.set(link.machine_id, { group_id: g.id, group_name: g.name });
    }
  }

  return machines.map((m) => ({
    id: m.id,
    name: m.name,
    line: m.line,
    primary_metric: m.primary_metric,
    group_id: groupMap.get(m.id)?.group_id ?? null,
    group_name: groupMap.get(m.id)?.group_name ?? null,
  }));
}

// ── Inline edit form ────────────────────────────────────────────────────────

function EditMachineForm({
  machine,
  groups,
  onSaved,
  onCancel,
}: {
  machine: MachineRow;
  groups: MachineGroup[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(machine.name);
  const [line, setLine] = useState(machine.line ?? "");
  const [metric, setMetric] = useState<PrimaryMetric>(
    isPrimaryMetric(machine.primary_metric) ? machine.primary_metric : "rpm"
  );
  const [groupId, setGroupId] = useState(machine.group_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nameError, setNameError] = useState<string | null>(null);
  const [lineError, setLineError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const nErr = validateMachineName(name);
    const lErr = validateLine(line);
    setNameError(nErr);
    setLineError(lErr);
    if (nErr || lErr) return;

    setSaving(true);

    try {
      const res = await fetch(`/api/machines/${machine.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName(name),
          line: trimmedLine(line) || null,
          primary_metric: metric,
          group_id: groupId || null,
        }),
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

  return (
    <form
      onSubmit={handleSave}
      className="rounded-xl border border-emerald-500/30 bg-zinc-800/60 p-4 space-y-3"
    >
      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1">
          Name <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(validateMachineName(e.target.value));
          }}
          onBlur={() => setNameError(validateMachineName(name))}
          maxLength={100}
          required
          className={`w-full rounded-lg border bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-colors ${
            nameError ? "border-red-500/60" : "border-zinc-700 focus:border-emerald-500/40"
          }`}
        />
        {nameError && <p className="mt-1 text-xs text-red-400">{nameError}</p>}
      </div>

      {/* Line */}
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1">
          Station / Line
        </label>
        <input
          type="text"
          value={line}
          onChange={(e) => {
            setLine(e.target.value);
            if (lineError) setLineError(validateLine(e.target.value));
          }}
          onBlur={() => setLineError(validateLine(line))}
          maxLength={100}
          placeholder="e.g. Line 1"
          className={`w-full rounded-lg border bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition-colors ${
            lineError ? "border-red-500/60" : "border-zinc-700 focus:border-emerald-500/40"
          }`}
        />
        {lineError && <p className="mt-1 text-xs text-red-400">{lineError}</p>}
      </div>

      {/* Metric + Group side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">
            Metric <span className="text-red-400">*</span>
          </label>
          <select
            value={metric}
            onChange={(e) => {
              if (isPrimaryMetric(e.target.value)) setMetric(e.target.value);
            }}
            className="w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-colors cursor-pointer"
          >
            {PRIMARY_METRICS.map((m) => (
              <option key={m} value={m}>
                {METRIC_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">
            Group
          </label>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-colors cursor-pointer"
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
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-zinc-700 px-4 py-1.5 text-sm text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Machine row (display mode) ──────────────────────────────────────────────

function MachineRowCard({
  machine,
  groups,
  onUpdated,
  onDeleted,
}: {
  machine: MachineRow;
  groups: MachineGroup[];
  onUpdated: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/machines/${machine.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      onDeleted();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  if (editing) {
    return (
      <EditMachineForm
        machine={machine}
        groups={groups}
        onSaved={() => {
          setEditing(false);
          onUpdated();
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const metricLabel =
    isPrimaryMetric(machine.primary_metric)
      ? METRIC_LABELS[machine.primary_metric]
      : machine.primary_metric;

  return (
    <div className="group rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 transition-colors hover:border-zinc-700">
      <div className="flex items-start justify-between gap-3">
        {/* Info */}
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-zinc-200 truncate">{machine.name}</h4>
          {machine.line && (
            <p className="text-[11px] text-zinc-500 truncate mt-0.5">{machine.line}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
              {metricLabel}
            </span>
            {machine.group_name && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-3 h-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
                {machine.group_name}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="p-1.5 rounded-md text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800 transition-colors"
            title="Edit machine"
          >
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
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
            title="Delete machine"
          >
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
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5">
          <p className="text-xs text-red-400 flex-1">
            Delete <span className="font-semibold">&quot;{machine.name}&quot;</span>? This cannot be undone.
          </p>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-md bg-red-600 hover:bg-red-500 px-3 py-1 text-xs font-medium text-white disabled:opacity-50 transition-colors"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmDelete(false);
              setDeleteError(null);
            }}
            disabled={deleting}
            className="rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Delete error */}
      {deleteError && (
        <p className="mt-2 text-xs text-red-400">{deleteError}</p>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function ManageMachinesList({
  plantId,
  groups,
  onChanged,
}: ManageMachinesListProps) {
  const [toast, setToast] = useState<Toast | null>(null);

  const {
    data: machines,
    error,
    isLoading,
    mutate: mutateMachines,
  } = useSWR<MachineRow[]>(
    ["manage-machines", plantId],
    () => fetchMachines(plantId),
    { revalidateOnFocus: true }
  );

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleUpdated = useCallback(() => {
    mutateMachines();
    onChanged?.();
    showToast({ type: "success", message: "Machine updated." });
  }, [mutateMachines, onChanged, showToast]);

  const handleDeleted = useCallback(() => {
    mutateMachines();
    onChanged?.();
    showToast({ type: "success", message: "Machine deleted." });
  }, [mutateMachines, onChanged, showToast]);

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500 py-6 justify-center">
        <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
        Loading machines…
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
        Failed to load machines: {error.message ?? String(error)}
      </div>
    );
  }

  const list = machines ?? [];

  // ── Empty ──
  if (list.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-zinc-500">No machines in this plant yet.</p>
        <p className="text-xs text-zinc-600 mt-1">
          Create a machine using the panel above.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toast */}
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
            onClick={() => setToast(null)}
            className="ml-3 text-current opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Machine list */}
      <p className="text-xs text-zinc-500 tabular-nums">
        {list.length} machine{list.length !== 1 ? "s" : ""}
      </p>
      {list.map((machine) => (
        <MachineRowCard
          key={machine.id}
          machine={machine}
          groups={groups}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      ))}
    </div>
  );
}
