"use client";

import { useState } from "react";
import { ReportBuilder, type ReportDefinition } from "@/components/reports/ReportBuilder";
import { ExportButton } from "@/components/ExportButton";

const REPORTS_API = process.env["NEXT_PUBLIC_REPORTS_API"] ?? "http://localhost:3018";

interface SavedReport {
  report_id: string;
  name: string;
  definition: ReportDefinition;
  created_at: string;
  updated_at: string;
}

export function ReportsView() {
  const [reportName, setReportName] = useState("New Report");
  const [definition, setDefinition] = useState<ReportDefinition>({
    metrics: [],
    visualizations: [],
    filters: [],
    date_range: { preset: "last_30_days" },
  });
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [showList, setShowList] = useState(false);

  const saveReport = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const res = await fetch(`${REPORTS_API}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: reportName, definition }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Failed to save report");
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save report");
    } finally {
      setSaving(false);
    }
  };

  const loadReports = async () => {
    setLoadingReports(true);
    try {
      const res = await fetch(`${REPORTS_API}/reports`);
      if (!res.ok) throw new Error("Failed to load reports");
      const body = (await res.json()) as { reports: SavedReport[] };
      setSavedReports(body.reports);
      setShowList(true);
    } catch {
      // ignore
    } finally {
      setLoadingReports(false);
    }
  };

  const loadReport = (report: SavedReport) => {
    setReportName(report.name);
    setDefinition(report.definition);
    setShowList(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            className="text-2xl font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-indigo-400 outline-none"
            value={reportName}
            onChange={(e) => setReportName(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadReports}
            disabled={loadingReports}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingReports ? "Loading…" : "My Reports"}
          </button>
          <button
            onClick={saveReport}
            disabled={saving}
            className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Report"}
          </button>
          <ExportButton
            reportName={reportName}
            sourceUrl={typeof window !== "undefined" ? window.location.href : ""}
            type="pdf"
          />
          <ExportButton
            reportName={reportName}
            sourceUrl={typeof window !== "undefined" ? window.location.href : ""}
            type="png"
          />
        </div>
      </div>

      {saveError && (
        <div className="rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {saveError}
        </div>
      )}
      {saveSuccess && (
        <div className="rounded bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          Report saved successfully
        </div>
      )}

      {/* Saved reports list */}
      {showList && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Saved Reports</h3>
            <button
              onClick={() => setShowList(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Close
            </button>
          </div>
          {savedReports.length === 0 ? (
            <p className="text-sm text-gray-400">No saved reports yet</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {savedReports.map((r) => (
                <li key={r.report_id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{r.name}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(r.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => loadReport(r)}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    Load
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Report Builder */}
      <ReportBuilder initialDefinition={definition} onChange={setDefinition} />
    </div>
  );
}
