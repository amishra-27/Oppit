"use client";

import { useCallback, useEffect } from "react";
import { mutate } from "swr";
import { useReadingsRealtime } from "@/app/hooks/useReadingsRealtime";

export function LiveRefetchController({
  plantId,
  machineId,
  fromIso,
  toIso,
}: {
  plantId: string;
  machineId: string;
  fromIso: string;
  toIso: string;
}) {
  const cardsKey = `/api/plants/${plantId}/cards`;
  const historyKey =
    `/api/machines/${machineId}/history?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;

  const onInsert = useCallback(() => {
    mutate(cardsKey);
    mutate(historyKey);
  }, [cardsKey, historyKey]);

  const status = useReadingsRealtime(machineId, onInsert);

  // Log realtime status changes for debugging RLS/publication issues
  useEffect(() => {
    if (status === "error") {
      console.warn(
        "[LiveRefetchController] Realtime subscription error. Check that:",
        "\n1. `readings` table is added to supabase_realtime publication",
        "\n2. RLS SELECT policy exists for anon/authenticated users",
        "\nSee docs/REALTIME_SETUP.md for setup instructions."
      );
    } else if (status === "connected") {
      console.log("[LiveRefetchController] Realtime connected for machine:", machineId);
    }
  }, [status, machineId]);

  return null;
}
