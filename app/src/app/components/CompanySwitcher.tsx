"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

const STORAGE_KEY = "active_company_id";

type Company = {
  id: string;
  name: string;
  role: string;
};

interface CompanySwitcherProps {
  onCompanyChange?: (companyId: string) => void;
}

export default function CompanySwitcher({
  onCompanyChange,
}: CompanySwitcherProps) {
  const supabase = createClient();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create-company form state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const selectCompany = useCallback(
    (companyId: string) => {
      setActiveId(companyId);
      localStorage.setItem(STORAGE_KEY, companyId);
      onCompanyChange?.(companyId);
    },
    [onCompanyChange]
  );

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: rpcError } = await supabase.rpc("get_my_companies");

    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    const list = (data ?? []) as Company[];
    setCompanies(list);

    if (list.length === 0) {
      setShowCreate(true);
      setLoading(false);
      return;
    }

    setShowCreate(false);

    // Restore from localStorage or auto-select first
    const stored = localStorage.getItem(STORAGE_KEY);
    const match = list.find((c) => c.id === stored);
    selectCompany(match ? match.id : list[0].id);

    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;

    setCreating(true);
    setCreateError(null);

    const { data, error: rpcError } = await supabase.rpc(
      "create_company_with_owner",
      { p_name: trimmed }
    );

    if (rpcError) {
      setCreateError(rpcError.message);
      setCreating(false);
      return;
    }

    // data is the new company id (uuid)
    const newId = data as string;
    setNewName("");
    setCreating(false);

    // Refresh company list and auto-select the new one
    selectCompany(newId);
    await loadCompanies();
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <div className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
        <span>Loading…</span>
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <span className="text-sm text-red-400" title={error}>
        Company load failed
      </span>
    );
  }

  // ── Create company form (zero companies OR user clicked "+") ──
  if (showCreate) {
    return (
      <form onSubmit={handleCreate} className="flex items-center gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Company name"
          required
          autoFocus
          className="rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-colors w-48"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 px-3 py-1.5 text-sm font-medium text-white hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all whitespace-nowrap"
        >
          {creating ? "Creating…" : "Create"}
        </button>
        {companies.length > 0 && (
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Cancel
          </button>
        )}
        {createError && (
          <span className="text-xs text-red-400 max-w-[200px] truncate" title={createError}>
            {createError}
          </span>
        )}
      </form>
    );
  }

  // ── Single company ──
  if (companies.length === 1) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-zinc-300">
          {companies[0].name}
        </span>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          title="Add company"
          className="w-6 h-6 rounded-md border border-zinc-700 bg-zinc-800/50 flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    );
  }

  // ── Multiple companies ──
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <select
          value={activeId ?? ""}
          onChange={(e) => selectCompany(e.target.value)}
          className="appearance-none rounded-lg border border-zinc-700 bg-zinc-800/80 pl-3 pr-8 py-1.5 text-sm font-medium text-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-colors cursor-pointer"
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        {/* Chevron */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      <button
        type="button"
        onClick={() => setShowCreate(true)}
        title="Add company"
        className="w-6 h-6 rounded-md border border-zinc-700 bg-zinc-800/50 flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}
