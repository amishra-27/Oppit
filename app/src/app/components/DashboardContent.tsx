"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import useSWR, { mutate } from "swr";
import { createClient } from "@/lib/supabase/client";
import { useCompany } from "./CompanyContext";
import CreatePlantForm from "./CreatePlantForm";

type Plant = {
  id: string;
  name: string;
  company_id: string;
};

export default function DashboardContent() {
  const { activeCompanyId, companyVersion } = useCompany();
  const [showCreateForm, setShowCreateForm] = useState(false);

  const swrKey = activeCompanyId
    ? ["plants", activeCompanyId, companyVersion]
    : null;

  const {
    data: plants,
    error,
    isLoading,
  } = useSWR<Plant[]>(
    swrKey,
    async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("plants")
        .select("id, name, company_id")
        .eq("company_id", activeCompanyId!)
        .order("name");

      if (error) throw error;
      return data as Plant[];
    },
    { revalidateOnFocus: true }
  );

  const handlePlantCreated = useCallback(() => {
    mutate(swrKey);
    setShowCreateForm(false);
  }, [swrKey]);

  return (
    <>
      {/* Welcome Section */}
      <div className="mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-2">Welcome to Oppit</h1>
        <p className="text-zinc-400 text-lg">
          Select a plant to view real-time machine monitoring
        </p>
      </div>

      {/* Plants Grid */}
      <section className="mb-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Your Plants
          </h2>
          <div className="flex items-center gap-3">
            {!isLoading && (
              <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-1 rounded">
                {plants?.length ?? 0} plant{(plants?.length ?? 0) !== 1 ? "s" : ""}
              </span>
            )}
            {activeCompanyId && (
              <button
                onClick={() => setShowCreateForm((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-emerald-400 hover:border-emerald-500/40 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {showCreateForm ? "Cancel" : "Add Plant"}
              </button>
            )}
          </div>
        </div>

        {/* Create Plant Form */}
        {showCreateForm && activeCompanyId && (
          <div className="mb-6 p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800">
            <h3 className="text-sm font-medium text-zinc-300 mb-3">Create a new plant</h3>
            <CreatePlantForm
              activeCompanyId={activeCompanyId}
              onCreated={handlePlantCreated}
            />
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 animate-pulse min-h-[200px]"
              >
                <div className="w-12 h-12 rounded-xl bg-zinc-800 mb-4" />
                <div className="h-5 w-32 bg-zinc-800 rounded mb-2" />
                <div className="h-4 w-20 bg-zinc-800/60 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-8 rounded-2xl border border-red-500/20 bg-red-500/5 text-center">
            <p className="text-sm text-red-400">
              Failed to load plants: {error.message ?? String(error)}
            </p>
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && plants && plants.length === 0 && (
          <div className="p-12 rounded-2xl border border-dashed border-zinc-800 text-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-8 h-8 text-zinc-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold mb-2">No plants yet</h3>
            <p className="text-sm text-zinc-500 max-w-sm mx-auto">
              This company doesn&apos;t have any plants configured. Plants and machines
              will appear here once they are added.
            </p>
          </div>
        )}

        {/* Plants list */}
        {!isLoading && !error && plants && plants.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plants.map((plant) => (
              <Link
                key={plant.id}
                href={`/plants/${plant.id}`}
                className="group relative p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 transition-all"
              >
                {/* Plant icon */}
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center mb-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-6 h-6 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                </div>

                {/* Plant info */}
                <h3 className="text-xl font-semibold mb-1">{plant.name}</h3>

                {/* Manage Machines CTA (text only here to avoid nested <a> hydration error) */}
                <span className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-zinc-500 group-hover:text-emerald-400 transition-colors">
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
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  Manage Machines
                </span>

                {/* Arrow indicator */}
                <div className="absolute bottom-6 right-6 text-zinc-600 group-hover:text-zinc-400 transition-colors">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </div>
              </Link>
            ))}

            {/* Add Plant Card */}
            <button
              onClick={() => setShowCreateForm(true)}
              className="p-6 rounded-2xl border border-dashed border-zinc-800 hover:border-emerald-500/30 transition-colors flex flex-col items-center justify-center text-center min-h-[200px] group"
            >
              <div className="w-12 h-12 rounded-xl bg-zinc-800 group-hover:bg-emerald-500/10 flex items-center justify-center mb-4 transition-colors">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-6 h-6 text-zinc-500 group-hover:text-emerald-400 transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p className="text-sm text-zinc-500 group-hover:text-emerald-400 font-medium transition-colors">Add Plant</p>
            </button>
          </div>
        )}
      </section>

    </>
  );
}
