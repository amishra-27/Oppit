"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MachineGroup } from "./types";

interface CreateGroupFormProps {
  activeCompanyId: string;
  onCreated: (group: MachineGroup) => void;
}

export default function CreateGroupForm({
  activeCompanyId,
  onCreated,
}: CreateGroupFormProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    const supabase = createClient();

    const { data, error: insertError } = await supabase
      .from("machine_groups")
      .insert({ company_id: activeCompanyId, name: trimmed })
      .select("id, company_id, name, created_at")
      .single();

    if (insertError) {
      // Surface unique-constraint violation nicely
      if (insertError.code === "23505") {
        setError("A group with that name already exists in this company.");
      } else {
        setError(insertError.message);
      }
      setLoading(false);
      return;
    }

    const group: MachineGroup = {
      id: data.id,
      companyId: data.company_id,
      name: data.name,
      createdAt: data.created_at,
    };

    setName("");
    setLoading(false);
    onCreated(group);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-zinc-400" htmlFor="group-name">
        New Machine Group
      </label>

      <div className="flex items-center gap-2">
        <input
          id="group-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Line 1, CNC Bay"
          required
          maxLength={100}
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-colors"
        />
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-1.5 text-sm font-medium text-white hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
        >
          {loading ? "Creating…" : "Create Group"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
