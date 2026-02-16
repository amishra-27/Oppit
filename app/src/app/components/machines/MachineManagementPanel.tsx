"use client";

import { useState } from "react";
import useSWR from "swr";
import { createClient } from "@/lib/supabase/client";
import type { MachineGroup } from "./types";
import type { CreatedMachine } from "./CreateMachineForm";
import CreateGroupForm from "./CreateGroupForm";
import CreateMachineForm from "./CreateMachineForm";

interface MachineManagementPanelProps {
  plantId: string;
  activeCompanyId: string;
  onMachineCreated?: (machine: CreatedMachine) => void;
}

export default function MachineManagementPanel({
  plantId,
  activeCompanyId,
  onMachineCreated,
}: MachineManagementPanelProps) {
  const [open, setOpen] = useState(false);

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
  }

  const resolvedGroups = groups ?? [];

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex items-center justify-center gap-2 w-full p-6 rounded-2xl border border-dashed border-zinc-800 hover:border-zinc-600 transition-colors text-center min-h-[120px]"
      >
        <div className="w-10 h-10 rounded-xl bg-zinc-800 group-hover:bg-zinc-700 flex items-center justify-center transition-colors">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5 text-zinc-500 group-hover:text-zinc-300 transition-colors"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <span className="text-sm font-medium text-zinc-500 group-hover:text-zinc-300 transition-colors">
          Add Machine
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Add Machine
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
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

      <div className="p-6 space-y-6">
        {/* Groups section */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Groups
            </h4>
            {!groupsLoading && (
              <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">
                {resolvedGroups.length}
              </span>
            )}
          </div>

          {/* Existing groups */}
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
            <div className="flex flex-wrap gap-2 mb-3">
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

          <CreateGroupForm
            activeCompanyId={activeCompanyId}
            onCreated={handleGroupCreated}
          />
        </section>

        {/* Divider */}
        <div className="border-t border-zinc-800" />

        {/* Machine form */}
        <section>
          <h4 className="text-xs font-medium uppercase tracking-wide text-zinc-500 mb-3">
            Machine Details
          </h4>
          <CreateMachineForm
            plantId={plantId}
            activeCompanyId={activeCompanyId}
            groups={resolvedGroups}
            onCreated={handleMachineCreated}
          />
        </section>
      </div>
    </div>
  );
}
