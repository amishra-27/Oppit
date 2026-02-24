"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/app/lib/supabaseBrowser";
import type { RealtimeChannel } from "@supabase/supabase-js";

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
 * Validates that a realtime payload contains a well-formed ReadingRow.
 * Returns the row if valid, or null if the shape is unexpected.
 */
function parseReadingPayload(payload: unknown): ReadingRow | null {
  if (typeof payload !== "object" || payload === null) return null;

  const obj = payload as Record<string, unknown>;
  const row = obj.new;
  if (typeof row !== "object" || row === null) return null;

  const r = row as Record<string, unknown>;

  if (
    typeof r.machine_id !== "string" ||
    typeof r.metric !== "string" ||
    typeof r.value !== "number" ||
    typeof r.ts_server !== "string"
  ) {
    return null;
  }

  return {
    id: typeof r.id === "string" || typeof r.id === "number" ? String(r.id) : undefined,
    machine_id: r.machine_id,
    metric: r.metric,
    value: r.value,
    ts_server: r.ts_server,
    ts_device:
      r.ts_device === null || r.ts_device === undefined
        ? null
        : typeof r.ts_device === "string"
          ? r.ts_device
          : null,
  };
}

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
  const [status, setStatus] = useState<SubscriptionStatus>(
    machineId ? "connecting" : "disconnected"
  );

  // Stable ref for the callback so the channel doesn't re-subscribe on every render
  const onInsertRef = useRef(onInsert);
  useEffect(() => {
    onInsertRef.current = onInsert;
  }, [onInsert]);

  // Track active channel to guarantee cleanup even during rapid switches
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    // ── Cleanup helper ──
    function teardown() {
      const ch = channelRef.current;
      if (ch) {
        channelRef.current = null;
        supabaseBrowser.removeChannel(ch).catch(() => {
          // removeChannel may reject if already removed; safe to ignore
        });
      }
    }

    if (!machineId) {
      teardown();
      setStatus("disconnected");
      return;
    }

    // Tear down any previous channel before creating a new one
    teardown();
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
          const row = parseReadingPayload(payload);
          if (row) {
            onInsertRef.current(row);
          }
        }
      )
      .subscribe((subStatus, err) => {
        switch (subStatus) {
          case "SUBSCRIBED":
            setStatus("connected");
            break;
          case "CHANNEL_ERROR":
            console.error("[useReadingsRealtime] channel error:", err);
            setStatus("error");
            break;
          case "TIMED_OUT":
            console.error("[useReadingsRealtime] subscription timed out:", err);
            setStatus("error");
            break;
          case "CLOSED":
            setStatus("disconnected");
            break;
          // Ignore transient states (e.g. "joining")
        }
      });

    channelRef.current = channel;

    // ── Unmount / dependency change cleanup ──
    return () => {
      teardown();
      setStatus("disconnected");
    };
    // Only re-subscribe when machineId changes.
    // onInsert is captured via ref so it doesn't trigger re-subscription.
  }, [machineId]);

  return status;
}
