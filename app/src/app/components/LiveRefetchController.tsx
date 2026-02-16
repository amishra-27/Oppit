"use client";

import { useCallback, useEffect, useRef } from "react";
import { mutate } from "swr";
import { useReadingsRealtime } from "@/app/hooks/useReadingsRealtime";

const TAG = "[LiveRefetchController]";
const DOCS_REF = "See docs/REALTIME_SETUP.md for setup instructions.";

/**
 * If connected but zero events arrive for an extended period the most likely
 * causes are a missing publication or RLS denying SELECT on readings.
 * We surface a one-time warning after this many seconds of silence.
 */
const SILENCE_WARN_SEC = 30;

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

  // Track whether we've received at least one event since connecting
  const receivedEvent = useRef(false);
  const silenceWarned = useRef(false);

  const onInsert = useCallback(() => {
    receivedEvent.current = true;
    mutate(cardsKey);
    mutate(historyKey);
  }, [cardsKey, historyKey]);

  const status = useReadingsRealtime(machineId, onInsert);

  // ── Distinct log messages per status transition ──
  useEffect(() => {
    switch (status) {
      case "connected":
        console.log(
          `${TAG} ✓ Realtime connected for machine ${machineId}. ` +
            "Listening for INSERT events on readings table."
        );
        // Reset silence tracking on (re)connect
        receivedEvent.current = false;
        silenceWarned.current = false;
        break;

      case "connecting":
        console.log(
          `${TAG} … Connecting realtime channel for machine ${machineId}.`
        );
        break;

      case "error":
        console.warn(
          `${TAG} ✗ Realtime channel error for machine ${machineId}.\n` +
            "Possible causes:\n" +
            "  • CHANNEL_ERROR — the server rejected the subscription.\n" +
            "    → Ensure the `readings` table is added to the supabase_realtime publication.\n" +
            "  • TIMED_OUT — the channel could not establish within the timeout window.\n" +
            "    → Check network connectivity and Supabase project status.\n" +
            "Data will continue to update via 5 s polling fallback.\n" +
            DOCS_REF
        );
        break;

      case "disconnected":
        console.log(
          `${TAG} Channel disconnected for machine ${machineId}. ` +
            "Polling fallback active."
        );
        break;
    }
  }, [status, machineId]);

  // ── Silence detection: publication missing or RLS denied ──
  // If we're "connected" but never receive an event, the channel is open
  // but the server isn't forwarding rows (publication missing or RLS SELECT
  // policy denying access). Surface a one-time warning.
  useEffect(() => {
    if (status !== "connected") return;

    const timer = setTimeout(() => {
      if (!receivedEvent.current && !silenceWarned.current) {
        silenceWarned.current = true;
        console.warn(
          `${TAG} ⚠ Realtime channel is connected but no events received after ${SILENCE_WARN_SEC}s.\n` +
            "This usually means one of:\n" +
            "  1. Publication missing — run: ALTER PUBLICATION supabase_realtime ADD TABLE readings;\n" +
            "  2. RLS SELECT policy blocks the authenticated user from reading the readings table.\n" +
            "  3. No new readings are being ingested for this machine (not an error if the machine is idle).\n" +
            "Polling fallback is still active so data will refresh on schedule.\n" +
            DOCS_REF
        );
      }
    }, SILENCE_WARN_SEC * 1000);

    return () => clearTimeout(timer);
  }, [status]);

  return null;
}
