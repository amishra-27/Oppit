"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

interface CreatePlantFormProps {
  activeCompanyId: string;
  onCreated?: (plantId: string) => void;
}

export default function CreatePlantForm({
  activeCompanyId,
  onCreated,
}: CreatePlantFormProps) {
  const supabase = createClient();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const trimmed = name.trim();
  const nameError =
    trimmed.length > 0 && trimmed.length < 2
      ? "Plant name must be at least 2 characters"
      : null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!trimmed || nameError) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    const { data, error: rpcError } = await supabase.rpc(
      "create_plant_for_company",
      { p_company_id: activeCompanyId, p_name: trimmed }
    );

    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    const plantId = data as string;
    setSuccess(true);
    setName("");
    setLoading(false);
    onCreated?.(plantId);

    // Auto-dismiss success after 3s
    setTimeout(() => setSuccess(false), 3000);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <label
          htmlFor="plantName"
          className="block text-sm font-medium text-zinc-400 mb-1.5"
        >
          Plant Name <span className="text-red-400">*</span>
        </label>
        <input
          id="plantName"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
            setSuccess(false);
          }}
          placeholder="e.g., Main Factory, Warehouse B"
          maxLength={100}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-colors"
          disabled={loading}
        />
        {nameError && (
          <p className="mt-1 text-xs text-red-400">{nameError}</p>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-zinc-500 hover:text-white ml-2"
          >
            ×
          </button>
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 text-sm text-emerald-400">
          Plant created successfully!
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !trimmed || !!nameError}
        className="w-full rounded-lg bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {loading ? "Creating…" : "Create Plant"}
      </button>
    </form>
  );
}
