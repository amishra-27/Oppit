"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useReadingsRealtime } from "@/app/hooks/useReadingsRealtime";
import MachineManagementPanel from "@/app/components/machines/MachineManagementPanel";
import PlantDailyMetricsTable from "@/app/components/analytics/PlantDailyMetricsTable";
import type { DailyStationRow } from "@/app/components/analytics/PlantDailyMetricsTable";

type Machine = {
  machine_id: string;
  machine_name: string;
  primary_metric: string;
  last_ts: string | null;
  last_value: number | null;
  is_fresh: boolean;
  is_running: boolean;
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

function MachineCard({ machine, plantId }: { machine: Machine; plantId: string }) {
  return (
    <Link
      href={`/machines/${machine.machine_id}?plantId=${plantId}`}
      className="group block rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 transition-all hover:shadow-lg hover:border-zinc-300 dark:hover:border-zinc-700 hover:-translate-y-0.5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-medium truncate">{machine.machine_name}</h3>
          <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
            {formatTimestamp(machine.last_ts)}
          </p>
        </div>
        <StatusPill isRunning={machine.is_running} isFresh={machine.is_fresh} />
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

export default function PlantDashboardPage() {
  const params = useParams();
  const plantId = params.plantId as string;

  // Fetch plant name + company_id for breadcrumb & management panel
  const [plantName, setPlantName] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

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
    `/api/plants/${plantId}/cards`,
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
  const rpmMachines = machines.filter((m) => m.primary_metric === "rpm" && m.last_value !== null);
  const avgRpm =
    rpmMachines.length > 0
      ? Math.round(rpmMachines.reduce((sum, m) => sum + (m.last_value ?? 0), 0) / rpmMachines.length)
      : "—";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      {/* Realtime subscription for instant card + daily metrics updates */}
      <PlantRealtimeController
        machineIds={machineIds}
        swrKeys={[`/api/plants/${plantId}/cards`, dailyMetricsKey]}
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
          <SummaryTile label="Avg RPM" value={avgRpm} subtitle="across rpm machines" />
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

        {/* Machine cards */}
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-4">
          Machines ({machines.length})
        </h2>
        {machines.length === 0 ? (
          <div className="p-12 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 text-center">
            <p className="text-zinc-500">No machines found for this plant.</p>
            <p className="text-xs text-zinc-600 mt-1">Machines will appear once they are registered and sending data.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {machines.map((machine) => (
              <MachineCard key={machine.machine_id} machine={machine} plantId={plantId} />
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
                mutate(`/api/plants/${plantId}/cards`);
              }}
            />
          </div>
        )}
      </main>
    </div>
  );
}
