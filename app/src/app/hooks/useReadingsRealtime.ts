"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/app/lib/supabaseBrowser";

type ReadingRow = {
  id?: string;
  machine_id: string;
  metric: string;
  value: number;
  ts_server: string;
  ts_device?: string | null;
};

type SubscriptionStatus = "connecting" | "connected" | "disconnected" | "error";

/**
 * Subscribe to realtime INSERT events on the readings table for a specific machine.
 * 
 * IMPORTANT: For this to work, you must:
 * 1. Enable realtime on the `readings` table (see docs/REALTIME_SETUP.md)
 * 2. Have an RLS SELECT policy that allows anon/authenticated users to read readings
 * 
 * If RLS blocks access, the subscription will connect but receive no events (silent failure).
 * Check the returned status for connection issues.
 */
export function useReadingsRealtime(
  machineId: string | null,
  onInsert: (row: ReadingRow) => void
): SubscriptionStatus {
  const [status, setStatus] = useState<SubscriptionStatus>("connecting");

  useEffect(() => {
    if (!machineId) {
      setStatus("disconnected");
      return;
    }

    setStatus("connecting");

    const channel = supabaseBrowser
      .channel(`readings:${machineId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "readings",
          filter: `machine_id=eq.${machineId}`,
        },
        (payload) => {
          const row = (payload as any).new as ReadingRow;
          onInsert(row);
        }
      )
      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          setStatus("connected");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("[useReadingsRealtime] Subscription error:", err);
          setStatus("error");
        } else if (status === "CLOSED") {
          setStatus("disconnected");
        }
      });

    return () => {
      supabaseBrowser.removeChannel(channel);
      setStatus("disconnected");
    };
  }, [machineId, onInsert]);

  return status;
}
