"use client";

import { useState } from "react";

const EXPORT_API = process.env["NEXT_PUBLIC_EXPORT_API"] ?? "http://localhost:3020";

interface ExportButtonProps {
  reportName: string;
  sourceUrl: string;
  type: "pdf" | "png";
  tenantName?: string;
  dateRange?: string;
  className?: string;
}

type JobStatus = "idle" | "pending" | "processing" | "completed" | "failed";

interface ExportJobResponse {
  job_id: string;
  status: string;
  created_at: string;
}

interface ExportJobPollResponse {
  job_id: string;
  status: string;
  download_url?: string;
  error?: string;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 15; // 30 seconds max

/**
 * Reusable ExportButton component.
 * On click, calls the Export Service API, polls for completion, then triggers download.
 * Requirements: 32.3
 */
export function ExportButton({
  reportName,
  sourceUrl,
  type,
  tenantName = "Platform",
  dateRange,
  className = "",
}: ExportButtonProps) {
  const [status, setStatus] = useState<JobStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setStatus("pending");
    setError(null);

    try {
      // Create export job
      const createRes = await fetch(`${EXPORT_API}/exports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          source_url: sourceUrl,
          report_name: reportName,
          tenant_name: tenantName,
          date_range: dateRange,
        }),
      });

      if (!createRes.ok) {
        const body = (await createRes.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to start export");
      }

      const { job_id } = (await createRes.json()) as ExportJobResponse;
      setStatus("processing");

      // Poll for completion
      let attempts = 0;
      while (attempts < MAX_POLL_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        attempts++;

        const pollRes = await fetch(`${EXPORT_API}/exports/${job_id}`, {
          headers: { "Content-Type": "application/json" },
        });

        if (!pollRes.ok) continue;

        const poll = (await pollRes.json()) as ExportJobPollResponse;

        if (poll.status === "completed" && poll.download_url) {
          setStatus("completed");
          // Trigger download
          const link = document.createElement("a");
          link.href = poll.download_url;
          link.download = `${reportName}.${type}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          // Reset after short delay
          setTimeout(() => setStatus("idle"), 3000);
          return;
        }

        if (poll.status === "failed") {
          throw new Error(poll.error ?? "Export failed");
        }
      }

      throw new Error("Export timed out — please try again");
    } catch (err) {
      setStatus("failed");
      setError(err instanceof Error ? err.message : "Export failed");
      setTimeout(() => {
        setStatus("idle");
        setError(null);
      }, 5000);
    }
  };

  const isLoading = status === "pending" || status === "processing";

  const label = {
    idle: `Export ${type.toUpperCase()}`,
    pending: "Starting…",
    processing: "Generating…",
    completed: "Downloaded!",
    failed: "Failed",
  }[status];

  const baseClass =
    "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  const variantClass =
    status === "completed"
      ? "bg-green-50 border-green-300 text-green-700"
      : status === "failed"
      ? "bg-red-50 border-red-300 text-red-700"
      : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400";

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={handleExport}
        disabled={isLoading}
        className={`${baseClass} ${variantClass} ${className}`}
        title={`Export as ${type.toUpperCase()}`}
        aria-label={`Export ${reportName} as ${type.toUpperCase()}`}
        aria-busy={isLoading}
      >
        {isLoading ? (
          <span
            className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
            aria-hidden="true"
          />
        ) : (
          <span aria-hidden="true">{type === "pdf" ? "📄" : "🖼️"}</span>
        )}
        {label}
      </button>
      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
