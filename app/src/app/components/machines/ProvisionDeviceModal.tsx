"use client";

import { useEffect, useState } from "react";

interface ProvisionDeviceModalProps {
  open: boolean;
  machineId: string;
  onClose: () => void;
}

type ProvisionResult = {
  machineId: string;
  keyId: string;
  deviceKey: string;
  ingestUrl: string;
};

export default function ProvisionDeviceModal({
  open,
  machineId,
  onClose,
}: ProvisionDeviceModalProps) {
  const [loading, setLoading] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Clear sensitive state when modal closes
  useEffect(() => {
    if (!open) {
      setResult(null);
      setError(null);
      setLoading(false);
      setRotating(false);
      setCopied(null);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  async function requestProvision(deactivateOldKeys: boolean): Promise<ProvisionResult> {
    const res = await fetch(`/api/machines/${machineId}/provision-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deactivateOldKeys }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      throw new Error(json.error ?? `HTTP ${res.status}`);
    }
    return (await res.json()) as ProvisionResult;
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const data = await requestProvision(true);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRotate() {
    setRotating(true);
    setError(null);
    try {
      const newKey = await requestProvision(true);
      setResult(newKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRotating(false);
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const envSnippet = result
    ? `INGEST_URL=${result.ingestUrl}\nMACHINE_KEY=${result.deviceKey}\nMACHINE_ID=${result.machineId}`
    : null;

  const monoCls =
    "w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-xs font-mono text-zinc-200 break-all select-all";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Provision device"
    >
      <div
        className="w-full max-w-lg mx-4 rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-200">Provision Device</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 -mr-1"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Machine ID */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Machine ID</label>
            <div className="flex items-center gap-2">
              <code className={monoCls}>{machineId}</code>
              <button
                type="button"
                onClick={() => copyToClipboard(machineId, "machineId")}
                className="shrink-0 rounded-md border border-zinc-700 px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
              >
                {copied === "machineId" ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {/* Generate / result */}
          {!result ? (
            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading}
              className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Generating..." : "Generate device key"}
            </button>
          ) : (
            <>
              {/* Device key */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Device Key
                </label>
                <div className="flex items-center gap-2">
                  <code className={monoCls}>{result.deviceKey}</code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(result.deviceKey, "deviceKey")}
                    className="shrink-0 rounded-md border border-zinc-700 px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
                  >
                    {copied === "deviceKey" ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-400">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  This key is shown once. Copy it now.
                </p>
              </div>

              {/* Firmware env snippet */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Firmware Environment
                </label>
                <div className="flex items-start gap-2">
                  <pre className={`${monoCls} whitespace-pre`}>{envSnippet}</pre>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(envSnippet!, "env")}
                    className="shrink-0 rounded-md border border-zinc-700 px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors mt-0.5"
                  >
                    {copied === "env" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              {/* Rotate key */}
              <button
                type="button"
                onClick={handleRotate}
                disabled={rotating}
                className="w-full rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {rotating ? "Rotating..." : "Rotate key"}
              </button>
            </>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4 text-red-400 shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
