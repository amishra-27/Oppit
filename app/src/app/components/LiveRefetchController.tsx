"use client";

import { useCallback } from "react";
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

  useReadingsRealtime(machineId, onInsert);

  return null;
}
