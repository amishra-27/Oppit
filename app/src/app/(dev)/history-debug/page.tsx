"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then(r => r.json());

export default function HistoryDebugPage() {
  const machineId = "5b10f377-9162-4a4d-b0ac-3e6fc41440d6"; // machine 1

  // last 15 minutes window
  const to = new Date();
  const from = new Date(to.getTime() - 15 * 60 * 1000);

  const live = true; // toggle this later with a checkbox

  const url =
    `/api/machines/${machineId}/history` +
    `?from=${encodeURIComponent(from.toISOString())}` +
    `&to=${encodeURIComponent(to.toISOString())}`;

  const { data, error, isLoading } = useSWR(url, fetcher, {
    refreshInterval: live ? 5000 : 0, // poll every 5s when "live"
    revalidateOnFocus: true,          // helps after tab sleep
    revalidateOnReconnect: true,
    keepPreviousData: true,
  }); // refreshInterval + auto revalidation are core SWR features :contentReference[oaicite:1]{index=1}

  if (isLoading) return <pre>Loading…</pre>;
  if (error) return <pre>Error: {String(error)}</pre>;

  return (
    <div style={{ padding: 16 }}>
      <h1>History Debug</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
