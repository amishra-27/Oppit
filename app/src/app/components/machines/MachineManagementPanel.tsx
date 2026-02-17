"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import type { MachineGroup } from "./types";
import type { CreatedMachine } from "./CreateMachineForm";
import CreateGroupForm from "./CreateGroupForm";
import CreateMachineForm from "./CreateMachineForm";
import ManageMachinesList from "./ManageMachinesList";

interface MachineManagementPanelProps {
  plantId: string;
  activeCompanyId: string;
  onMachineCreated?: (machine: CreatedMachine) => void;
  onMachinesChanged?: () => void;
}

type PanelTab = "machine" | "group";

export default function MachineManagementPanel({
  plantId,
  activeCompanyId,
  onMachineCreated,
  onMachinesChanged,
}: MachineManagementPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab | null>(null);

  // Fetch groups scoped to activeCompanyId
  const {
    data: groups,
    error: groupsError,
    isLoading: groupsLoading,
    mutate: mutateGroups,
  } = useSWR<MachineGroup[]>(
    activeCompanyId ? ["machine_groups", activeCompanyId] : null,
    async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("machine_groups")
        .select("id, company_id, name, created_at")
        .eq("company_id", activeCompanyId)
        .order("name");

      if (error) throw error;

      return (data ?? []).map((r) => ({
        id: r.id,
        companyId: r.company_id,
        name: r.name,
        createdAt: r.created_at,
      }));
    },
    { revalidateOnFocus: false }
  );

  function handleGroupCreated(group: MachineGroup) {
    // Optimistically append & revalidate
    mutateGroups((prev) => [...(prev ?? []), group], { revalidate: true });
  }

  function handleMachineCreated(machine: CreatedMachine) {
    onMachineCreated?.(machine);
    onMachinesChanged?.();
  }

  const resolvedGroups = groups ?? [];

  // ── Collapsed: two sibling CTA cards ──────────────────────────────────────

  if (activeTab === null) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {/* Add Machine CTA */}
        <button
          type="button"
          onClick={() => setActiveTab("machine")}
          className="group flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border border-dashed border-zinc-800 hover:border-emerald-500/40 transition-colors text-center min-h-[110px]"
        >
          <div className="w-10 h-10 rounded-xl bg-zinc-800 group-hover:bg-emerald-500/10 flex items-center justify-center transition-colors">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 text-zinc-500 group-hover:text-emerald-400 transition-colors"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <span className="text-sm font-medium text-zinc-500 group-hover:text-emerald-400 transition-colors">
            Add Machine
          </span>
        </button>

        {/* Add Group CTA */}
        <button
          type="button"
          onClick={() => setActiveTab("group")}
          className="group flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border border-dashed border-zinc-800 hover:border-cyan-500/40 transition-colors text-center min-h-[110px]"
        >
          <div className="w-10 h-10 rounded-xl bg-zinc-800 group-hover:bg-cyan-500/10 flex items-center justify-center transition-colors">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 text-zinc-500 group-hover:text-cyan-400 transition-colors"
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
          </div>
          <span className="text-sm font-medium text-zinc-500 group-hover:text-cyan-400 transition-colors">
            Add Group
          </span>
        </button>
      </div>
    );
  }

  // ── Expanded: tabbed panel ────────────────────────────────────────────────

  return (
    <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 overflow-hidden">
      {/* Header with close */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Manage
        </h3>
        <button
          type="button"
          onClick={() => setActiveTab(null)}
          className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 -mr-1"
          aria-label="Close panel"
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

      {/* Segmented tab control */}
      <div className="px-6 pt-5 pb-1">
        <div className="flex rounded-lg bg-zinc-800/60 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("machine")}
            className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium rounded-md py-2 transition-colors ${
              activeTab === "machine"
                ? "bg-zinc-700 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-300"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
              />
            </svg>
            Machine
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("group")}
            className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-medium rounded-md py-2 transition-colors ${
              activeTab === "group"
                ? "bg-zinc-700 text-white shadow-sm"
                : "text-zinc-400 hover:text-zinc-300"
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
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
            Group
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="p-6 space-y-6">
        {/* ── Machine tab ── */}
        {activeTab === "machine" && (
          <>
            <section>
              <h4 className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-3">
                New Machine
              </h4>
              <CreateMachineForm
                plantId={plantId}
                activeCompanyId={activeCompanyId}
                groups={resolvedGroups}
                onCreated={handleMachineCreated}
              />
            </section>

            <div className="border-t border-zinc-800" />

            <section>
              <h4 className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-3">
                Existing Machines
              </h4>
              <ManageMachinesList
                plantId={plantId}
                groups={resolvedGroups}
                onChanged={onMachinesChanged}
              />
            </section>
          </>
        )}

        {/* ── Group tab ── */}
        {activeTab === "group" && (
          <>
            <section>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Existing Groups
                </h4>
                {!groupsLoading && (
                  <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">
                    {resolvedGroups.length}
                  </span>
                )}
              </div>

              {groupsLoading && (
                <div className="flex items-center gap-2 text-sm text-zinc-500 mb-3">
                  <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
                  Loading groups…
                </div>
              )}

              {groupsError && (
                <p className="text-xs text-red-400 mb-3">
                  Failed to load groups: {groupsError.message ?? String(groupsError)}
                </p>
              )}

              {!groupsLoading && !groupsError && resolvedGroups.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {resolvedGroups.map((g) => (
                    <span
                      key={g.id}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-zinc-800 text-zinc-300 border border-zinc-700"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="w-3 h-3 text-zinc-500"
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
                      {g.name}
                    </span>
                  ))}
                </div>
              )}

              {!groupsLoading && !groupsError && resolvedGroups.length === 0 && (
                <p className="text-xs text-zinc-500 mb-4">
                  No groups yet — create your first one below.
                </p>
              )}
            </section>

            <div className="border-t border-zinc-800" />

            <section>
              <h4 className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-3">
                New Group
              </h4>
              <CreateGroupForm
                activeCompanyId={activeCompanyId}
                onCreated={handleGroupCreated}
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
