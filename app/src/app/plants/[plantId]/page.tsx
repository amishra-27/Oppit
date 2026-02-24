"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useReadingsRealtime } from "@/app/hooks/useReadingsRealtime";
import MachineManagementPanel from "@/app/components/machines/MachineManagementPanel";
import PlantDailyMetricsTable from "@/app/components/analytics/PlantDailyMetricsTable";
import type { DailyStationRow } from "@/app/components/analytics/PlantDailyMetricsTable";
import EditMachineModal from "@/app/components/machines/EditMachineModal";

type Machine = {
  machine_id: string;
  machine_name: string;
  primary_metric: string;
  last_ts: string | null;
  last_value: number | null;
  is_fresh: boolean;
  is_running: boolean;
  group_name?: string | null;
  group_id?: string | null;
  line?: string | null;
};

type CardsResponse = {
  plant_id: string;
  freshness_seconds: number;
  machines: Machine[];
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

function formatTimestamp(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function StatusPill({ isRunning, isFresh }: { isRunning: boolean; isFresh: boolean }) {
  if (!isFresh) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Stale
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        isRunning
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isRunning ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"
        }`}
      />
      {isRunning ? "Running" : "Stopped"}
    </span>
  );
}

function SummaryTile({ label, value, subtitle }: { label: string; value: string | number; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {subtitle && <p className="text-xs text-zinc-400 mt-1">{subtitle}</p>}
    </div>
  );
}

function MachineCard({
  machine,
  plantId,
  onEdit,
  onDelete,
}: {
  machine: Machine;
  plantId: string;
  onEdit: (machine: Machine) => void;
  onDelete: (machine: Machine) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // Close menu on Escape
  useEffect(() => {
    if (!menuOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [menuOpen]);

  return (
    <Link
      href={`/machines/${machine.machine_id}?plantId=${plantId}`}
      className="group block rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 transition-all hover:shadow-lg hover:border-zinc-300 dark:hover:border-zinc-700 hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium truncate">{machine.machine_name}</h3>
          {machine.line && (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-600 truncate mt-0.5">
              {machine.line}
            </p>
          )}
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            {formatTimestamp(machine.last_ts)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <StatusPill isRunning={machine.is_running} isFresh={machine.is_fresh} />
          {/* Kebab action menu */}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen((prev) => !prev);
              }}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
              aria-label="Machine actions"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <circle cx="10" cy="4" r="1.5" />
                <circle cx="10" cy="10" r="1.5" />
                <circle cx="10" cy="16" r="1.5" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-36 rounded-lg bg-zinc-800 border border-zinc-700 shadow-xl z-30 py-1 animate-in fade-in slide-in-from-top-1 duration-100">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuOpen(false);
                    onEdit(machine);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors text-left"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuOpen(false);
                    onDelete(machine);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors text-left"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
          {machine.primary_metric}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4 text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-400 transition-colors"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

// Subscribe one machine to realtime, trigger cards + daily metrics mutate on INSERT
function MachineRealtimeSub({
  machineId,
  swrKeys,
}: {
  machineId: string;
  swrKeys: string[];
}) {
  const onInsert = useCallback(() => {
    swrKeys.forEach((k) => mutate(k));
  }, [swrKeys]);

  useReadingsRealtime(machineId, onInsert);

  return null;
}

// Subscribe to ALL machine readings to trigger refresh
function PlantRealtimeController({
  machineIds,
  swrKeys,
}: {
  machineIds: string[];
  swrKeys: string[];
}) {
  return (
    <>
      {machineIds.map((id) => (
        <MachineRealtimeSub key={id} machineId={id} swrKeys={swrKeys} />
      ))}
    </>
  );
}

// ── Delete Confirm Dialog ───────────────────────────────────────────────────

function DeleteConfirmDialog({
  machine,
  onClose,
  onDeleted,
}: {
  machine: Machine;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleDelete() {
    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/machines/${machine.machine_id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">Delete Machine</h3>
            <p className="text-xs text-zinc-500 mt-0.5">This action cannot be undone.</p>
          </div>
        </div>

        <p className="text-sm text-zinc-400 mb-5">
          Are you sure you want to delete{" "}
          <span className="font-medium text-zinc-200">&quot;{machine.machine_name}&quot;</span>?
          All associated readings and data will be permanently removed.
        </p>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg bg-red-600 hover:bg-red-500 px-5 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlantDashboardPage() {
  const params = useParams();
  const plantId = params.plantId as string;

  // Fetch plant name + company_id for breadcrumb & management panel
  const [plantName, setPlantName] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  // ── Groups for edit modal ──
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (!companyId) return;
    const supabase = createClient();
    supabase
      .from("machine_groups")
      .select("id, name")
      .eq("company_id", companyId)
      .order("name")
      .then(({ data }) => {
        if (data) setGroups(data.map((r) => ({ id: r.id, name: r.name })));
      });
  }, [companyId]);

  // ── Card action state (edit/delete modals, inline flash) ──
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [deletingMachine, setDeletingMachine] = useState<Machine | null>(null);
  const [flash, setFlash] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Auto-clear flash after 4 s
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(timer);
  }, [flash]);

  const cardsKey = `/api/plants/${plantId}/cards`;

  const handleEditSaved = useCallback(() => {
    setEditingMachine(null);
    mutate(cardsKey);
    setFlash({ message: "Machine updated successfully", type: "success" });
  }, [cardsKey]);

  const handleDeleteConfirmed = useCallback(() => {
    setDeletingMachine(null);
    mutate(cardsKey);
    setFlash({ message: "Machine deleted", type: "success" });
  }, [cardsKey]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("plants")
      .select("name, company_id")
      .eq("id", plantId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setPlantName(data.name);
          setCompanyId(data.company_id);
        }
      });
  }, [plantId]);

  const { data, error, isLoading } = useSWR<CardsResponse>(
    cardsKey,
    fetcher,
    { refreshInterval: 5000, revalidateOnFocus: true, revalidateOnReconnect: true }
  );

  // ── Day selector + daily metrics ──
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const [selectedDay, setSelectedDay] = useState(todayStr);

  const tz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    []
  );

  const dailyMetricsKey = `/api/plants/${plantId}/metrics?day=${selectedDay}&tz=${encodeURIComponent(tz)}`;

  type DailyMetricsResponse = {
    rows: DailyStationRow[];
    error?: string;
  };

  const {
    data: dailyData,
    error: dailyError,
    isLoading: dailyLoading,
  } = useSWR<DailyMetricsResponse>(dailyMetricsKey, fetcher, {
    refreshInterval: selectedDay === todayStr ? 10_000 : 0, // poll only for today
    revalidateOnFocus: true,
    keepPreviousData: true,
  });

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
          You don&apos;t have access to this plant. It may belong to a different company.
        </p>
        <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors mt-2">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  if (httpStatus === 404 || (data?.error && data.error.includes("not found"))) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-black text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-zinc-200">Plant not found</h2>
        <p className="text-sm text-zinc-500 max-w-sm">
          This plant doesn&apos;t exist or you don&apos;t have access.
        </p>
        <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors mt-2">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="flex items-center gap-3 text-zinc-500">
          <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
          Loading dashboard...
        </div>
      </div>
    );
  }

  if (error || data?.error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-black text-center gap-4">
        <p className="text-red-500">Error loading data: {data?.error ?? String(error)}</p>
        <Link href="/" className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const machines = data?.machines ?? [];
  const machineIds = machines.map((m) => m.machine_id);
  const totalMachines = machines.length;
  const runningNow = machines.filter((m) => m.is_running).length;
  const liveUptime =
    totalMachines > 0
      ? Math.round((runningNow / totalMachines) * 100) + "%"
      : "—";

  // Group machines by group_name for sectioned rendering
  const grouped = (() => {
    const map = new Map<string, Machine[]>();
    for (const m of machines) {
      const key = m.group_name ?? "Ungrouped";
      const arr = map.get(key);
      if (arr) arr.push(m);
      else map.set(key, [m]);
    }
    // Sort: named groups first (alphabetical), "Ungrouped" last
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === "Ungrouped") return 1;
      if (b[0] === "Ungrouped") return -1;
      return a[0].localeCompare(b[0]);
    });
  })();

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Realtime subscription for instant card + daily metrics updates */}
      <PlantRealtimeController
        machineIds={machineIds}
        swrKeys={[cardsKey, dailyMetricsKey]}
      />

      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Logo - links back to home */}
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <span className="text-lg font-bold tracking-tight hidden sm:inline">Oppit</span>
            </Link>

            {/* Breadcrumb separator */}
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-zinc-300 dark:text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>

            {/* Plant name */}
            <div>
              <h1 className="text-lg font-semibold">{plantName ?? "Plant"}</h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Live • Auto-refreshing
              </p>
            </div>
          </div>

          {/* Back to plants link */}
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            All Plants
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Summary tiles */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <SummaryTile label="Total Machines" value={totalMachines} />
          <SummaryTile
            label="Running Now"
            value={runningNow}
            subtitle={`${totalMachines - runningNow} stopped`}
          />
          <SummaryTile label="Live Uptime" value={liveUptime} subtitle="machines running now" />
        </div>

        {/* Daily metrics table */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Daily Station Metrics
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const d = new Date(selectedDay + "T00:00:00");
                  d.setDate(d.getDate() - 1);
                  setSelectedDay(
                    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
                  );
                }}
                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                aria-label="Previous day"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <input
                type="date"
                value={selectedDay}
                max={todayStr}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-800/60 px-2.5 py-1 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-colors [color-scheme:dark]"
              />
              <button
                onClick={() => {
                  const d = new Date(selectedDay + "T00:00:00");
                  d.setDate(d.getDate() + 1);
                  const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  if (next <= todayStr) setSelectedDay(next);
                }}
                disabled={selectedDay >= todayStr}
                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Next day"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {selectedDay !== todayStr && (
                <button
                  onClick={() => setSelectedDay(todayStr)}
                  className="ml-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  Today
                </button>
              )}
            </div>
          </div>
          <PlantDailyMetricsTable
            rows={dailyData?.rows ?? []}
            isLoading={dailyLoading}
            error={dailyError ? (dailyError as Error).message : (dailyData?.error ?? null)}
          />
        </div>

        {/* Machine cards – grouped by group_name */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Machines ({machines.length})
          </h2>
          {flash && (
            <div
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity ${
                flash.type === "success"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}
            >
              {flash.type === "success" ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
              {flash.message}
              <button
                type="button"
                onClick={() => setFlash(null)}
                className="ml-1 opacity-60 hover:opacity-100 transition-opacity"
                aria-label="Dismiss"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
        {machines.length === 0 ? (
          <div className="p-12 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 text-center">
            <p className="text-zinc-500">No machines found for this plant.</p>
            <p className="text-xs text-zinc-600 mt-1">Machines will appear once they are registered and sending data.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {grouped.map(([groupName, groupMachines]) => (
              <section key={groupName}>
                {/* Show group heading only when there are named groups (skip for single "Ungrouped" bucket) */}
                {(grouped.length > 1 || groupName !== "Ungrouped") && (
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3 flex items-center gap-2">
                    <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                    {groupName}
                    <span className="tabular-nums text-zinc-500 dark:text-zinc-600 font-normal">
                      ({groupMachines.length})
                    </span>
                    <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                  </h3>
                )}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {groupMachines.map((machine) => (
                    <MachineCard
                      key={machine.machine_id}
                      machine={machine}
                      plantId={plantId}
                      onEdit={setEditingMachine}
                      onDelete={setDeletingMachine}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Machine management panel */}
        {companyId && (
          <div className="mt-8">
            <MachineManagementPanel
              plantId={plantId}
              activeCompanyId={companyId}
              onMachineCreated={() => {
                mutate(cardsKey);
              }}
              onMachinesChanged={() => {
                mutate(cardsKey);
              }}
            />
          </div>
        )}
      </main>

      {/* ── Edit / Delete modals ── */}
      <EditMachineModal
        open={!!editingMachine}
        machine={
          editingMachine
            ? {
                id: editingMachine.machine_id,
                name: editingMachine.machine_name,
                line: editingMachine.line,
                primary_metric: editingMachine.primary_metric,
                group_id: editingMachine.group_id,
              }
            : null
        }
        groups={groups}
        onClose={() => setEditingMachine(null)}
        onSaved={handleEditSaved}
      />
      {deletingMachine && (
        <DeleteConfirmDialog
          machine={deletingMachine}
          onClose={() => setDeletingMachine(null)}
          onDeleted={handleDeleteConfirmed}
        />
      )}

    </div>
  );
}
