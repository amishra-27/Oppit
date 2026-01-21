"use client";

import { useEffect } from "react";
import { supabaseBrowser } from "@/app/lib/supabaseBrowser";

type ReadingRow = {
  id?: string;
  machine_id: string;
  metric: string;
  value: number;
  ts_server: string;
  ts_device?: string | null;
};

export function useReadingsRealtime(
  machineId: string | null,
  onInsert: (row: ReadingRow) => void
) {
  useEffect(() => {
    if (!machineId) return;

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
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [machineId, onInsert]);
}
