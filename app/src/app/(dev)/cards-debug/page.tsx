"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

export default function CardsDebugPage() {
  const plantId = "f08b52f7-4615-4f25-9164-5e4011496e63"; // hardcode for now

  const { data, error, isLoading } = useSWR(
    `/api/plants/${plantId}/cards`,
    fetcher,
    { refreshInterval: 5000 } // poll every 5s
  );

  if (isLoading) return <pre>Loading…</pre>;
  if (error) return <pre>Error: {String(error)}</pre>;

  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
