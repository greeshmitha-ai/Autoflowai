"use client";

import { useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Subsystem = "contacts" | "campaigns" | "calls" | "surveys" | "deals";
export type Aggregation = "count" | "sum" | "avg" | "min" | "max";
export type VisualizationType = "bar_chart" | "line_chart" | "pie_chart" | "data_table" | "metric_card";
export type DatePreset = "today" | "last_7_days" | "last_30_days" | "last_90_days" | "this_month" | "last_month";

export interface ReportMetric {
  id: string;
  subsystem: Subsystem;
  field: string;
  aggregation: Aggregation;
  label?: string;
}

export interface ReportVisualization {
  id: string;
  type: VisualizationType;
  metric_ids: string[];
  title?: string;
}

export interface ReportFilter {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "between";
  value: string;
}

export interface ReportDefinition {
  metrics: ReportMetric[];
  visualizations: ReportVisualization[];
  filters: ReportFilter[];
  date_range?: {
    preset?: DatePreset;
    start?: string;
    end?: string;
  };
}

// ─── Available metrics per subsystem ─────────────────────────────────────────

const SUBSYSTEM_FIELDS: Record<Subsystem, { field: string; label: string; aggregations: Aggregation[] }[]> = {
  contacts: [
    { field: "id", label: "Contact count", aggregations: ["count"] },
    { field: "lead_score", label: "Lead score", aggregations: ["avg", "min", "max", "sum"] },
  ],
  campaigns: [
    { field: "id", label: "Campaign count", aggregations: ["count"] },
  ],
  calls: [
    { field: "id", label: "Call count", aggregations: ["count"] },
    { field: "duration_seconds", label: "Call duration (s)", aggregations: ["avg", "sum"] },
  ],
  surveys: [
    { field: "id", label: "Survey count", aggregations: ["count"] },
  ],
  deals: [
    { field: "id", label: "Deal count", aggregations: ["count"] },
    { field: "value", label: "Deal value", aggregations: ["sum"] },
  ],
};

const VIZ_TYPES: { type: VisualizationType; label: string; icon: string }[] = [
  { type: "bar_chart", label: "Bar chart", icon: "▦" },
  { type: "line_chart", label: "Line chart", icon: "📈" },
  { type: "pie_chart", label: "Pie chart", icon: "◔" },
  { type: "data_table", label: "Data table", icon: "⊞" },
  { type: "metric_card", label: "Metric card", icon: "◻" },
];

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
];

let idCounter = 0;
function newId(prefix: string) {
  return `${prefix}-${++idCounter}-${Date.now()}`;
}

// ─── ReportBuilder component ──────────────────────────────────────────────────

interface ReportBuilderProps {
  initialDefinition?: ReportDefinition;
  onChange?: (definition: ReportDefinition) => void;
}

export function ReportBuilder({ initialDefinition, onChange }: ReportBuilderProps) {
  const [metrics, setMetrics] = useState<ReportMetric[]>(initialDefinition?.metrics ?? []);
  const [visualizations, setVisualizations] = useState<ReportVisualization[]>(
    initialDefinition?.visualizations ?? [],
  );
  const [filters, setFilters] = useState<ReportFilter[]>(initialDefinition?.filters ?? []);
  const [datePreset, setDatePreset] = useState<DatePreset>(
    initialDefinition?.date_range?.preset ?? "last_30_days",
  );

  // Drag state for metric → visualization
  const [draggingMetricId, setDraggingMetricId] = useState<string | null>(null);

  const notify = useCallback(
    (
      m: ReportMetric[],
      v: ReportVisualization[],
      f: ReportFilter[],
      dp: DatePreset,
    ) => {
      onChange?.({
        metrics: m,
        visualizations: v,
        filters: f,
        date_range: { preset: dp },
      });
    },
    [onChange],
  );

  // ─── Metrics ────────────────────────────────────────────────────────────────

  const addMetric = useCallback(
    (subsystem: Subsystem, field: string, aggregation: Aggregation, label: string) => {
      const metric: ReportMetric = {
        id: newId("metric"),
        subsystem,
        field,
        aggregation,
        label,
      };
      const next = [...metrics, metric];
      setMetrics(next);
      notify(next, visualizations, filters, datePreset);
    },
    [metrics, visualizations, filters, datePreset, notify],
  );

  const removeMetric = useCallback(
    (metricId: string) => {
      const nextMetrics = metrics.filter((m) => m.id !== metricId);
      const nextViz = visualizations.map((v) => ({
        ...v,
        metric_ids: v.metric_ids.filter((id) => id !== metricId),
      }));
      setMetrics(nextMetrics);
      setVisualizations(nextViz);
      notify(nextMetrics, nextViz, filters, datePreset);
    },
    [metrics, visualizations, filters, datePreset, notify],
  );

  // ─── Visualizations ──────────────────────────────────────────────────────────

  const addVisualization = useCallback(
    (type: VisualizationType) => {
      const viz: ReportVisualization = {
        id: newId("viz"),
        type,
        metric_ids: [],
        title: VIZ_TYPES.find((v) => v.type === type)?.label,
      };
      const next = [...visualizations, viz];
      setVisualizations(next);
      notify(metrics, next, filters, datePreset);
    },
    [metrics, visualizations, filters, datePreset, notify],
  );

  const removeVisualization = useCallback(
    (vizId: string) => {
      const next = visualizations.filter((v) => v.id !== vizId);
      setVisualizations(next);
      notify(metrics, next, filters, datePreset);
    },
    [metrics, visualizations, filters, datePreset, notify],
  );

  const dropMetricOnViz = useCallback(
    (vizId: string, metricId: string) => {
      const next = visualizations.map((v) => {
        if (v.id !== vizId) return v;
        if (v.metric_ids.includes(metricId)) return v;
        return { ...v, metric_ids: [...v.metric_ids, metricId] };
      });
      setVisualizations(next);
      notify(metrics, next, filters, datePreset);
    },
    [metrics, visualizations, filters, datePreset, notify],
  );

  const updateVizTitle = useCallback(
    (vizId: string, title: string) => {
      const next = visualizations.map((v) => (v.id === vizId ? { ...v, title } : v));
      setVisualizations(next);
      notify(metrics, next, filters, datePreset);
    },
    [metrics, visualizations, filters, datePreset, notify],
  );

  // ─── Filters ─────────────────────────────────────────────────────────────────

  const addFilter = useCallback(() => {
    const filter: ReportFilter = { field: "", operator: "eq", value: "" };
    const next = [...filters, filter];
    setFilters(next);
    notify(metrics, visualizations, next, datePreset);
  }, [metrics, visualizations, filters, datePreset, notify]);

  const updateFilter = useCallback(
    (index: number, patch: Partial<ReportFilter>) => {
      const next = filters.map((f, i) => (i === index ? { ...f, ...patch } : f));
      setFilters(next);
      notify(metrics, visualizations, next, datePreset);
    },
    [metrics, visualizations, filters, datePreset, notify],
  );

  const removeFilter = useCallback(
    (index: number) => {
      const next = filters.filter((_, i) => i !== index);
      setFilters(next);
      notify(metrics, visualizations, next, datePreset);
    },
    [metrics, visualizations, filters, datePreset, notify],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Date range */}
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Date range</h3>
        <div className="flex flex-wrap gap-2">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => {
                setDatePreset(p.value);
                notify(metrics, visualizations, filters, p.value);
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                datePreset === p.value
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-indigo-400"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      <div className="flex gap-4">
        {/* Metric selector */}
        <section className="w-64 flex-shrink-0 rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Metrics</h3>
          {(Object.entries(SUBSYSTEM_FIELDS) as [Subsystem, typeof SUBSYSTEM_FIELDS[Subsystem]][]).map(
            ([subsystem, fields]) => (
              <div key={subsystem} className="mb-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 capitalize">
                  {subsystem}
                </p>
                {fields.map((f) =>
                  f.aggregations.map((agg) => {
                    const alreadyAdded = metrics.some(
                      (m) => m.subsystem === subsystem && m.field === f.field && m.aggregation === agg,
                    );
                    return (
                      <div
                        key={`${subsystem}-${f.field}-${agg}`}
                        draggable={!alreadyAdded}
                        onDragStart={() => {
                          if (!alreadyAdded) {
                            // We'll add the metric on drag start and track its id
                            addMetric(subsystem, f.field, agg, `${f.label} (${agg})`);
                          }
                        }}
                        className={`flex items-center justify-between px-2 py-1 rounded text-xs mb-1 border cursor-pointer select-none ${
                          alreadyAdded
                            ? "bg-indigo-50 border-indigo-200 text-indigo-700"
                            : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-indigo-50 hover:border-indigo-300"
                        }`}
                        onClick={() => {
                          if (!alreadyAdded) {
                            addMetric(subsystem, f.field, agg, `${f.label} (${agg})`);
                          }
                        }}
                      >
                        <span>{f.label}</span>
                        <span className="text-gray-400 ml-1">{agg}</span>
                        {alreadyAdded && <span className="ml-1 text-indigo-500">✓</span>}
                      </div>
                    );
                  }),
                )}
              </div>
            ),
          )}
        </section>

        {/* Canvas */}
        <div className="flex-1 flex flex-col gap-4">
          {/* Selected metrics */}
          {metrics.length > 0 && (
            <section className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Selected metrics</h3>
              <div className="flex flex-wrap gap-2">
                {metrics.map((m) => (
                  <div
                    key={m.id}
                    draggable
                    onDragStart={() => setDraggingMetricId(m.id)}
                    onDragEnd={() => setDraggingMetricId(null)}
                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-100 text-indigo-800 text-xs font-medium border border-indigo-200 cursor-grab"
                  >
                    <span className="capitalize">{m.subsystem}</span>
                    <span className="text-indigo-400">·</span>
                    <span>{m.label ?? `${m.field} (${m.aggregation})`}</span>
                    <button
                      onClick={() => removeMetric(m.id)}
                      className="ml-1 text-indigo-400 hover:text-red-500"
                      title="Remove metric"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Visualization types */}
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Add visualization</h3>
            <div className="flex flex-wrap gap-2">
              {VIZ_TYPES.map((v) => (
                <button
                  key={v.type}
                  onClick={() => addVisualization(v.type)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:border-indigo-400 hover:bg-indigo-50 transition-colors"
                >
                  <span>{v.icon}</span>
                  {v.label}
                </button>
              ))}
            </div>
          </section>

          {/* Visualizations canvas */}
          {visualizations.length > 0 && (
            <section className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Visualizations</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {visualizations.map((viz) => (
                  <div
                    key={viz.id}
                    className="rounded-lg border-2 border-dashed border-gray-300 p-3 bg-gray-50 min-h-[120px]"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggingMetricId) {
                        dropMetricOnViz(viz.id, draggingMetricId);
                        setDraggingMetricId(null);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1">
                        <span className="text-sm">
                          {VIZ_TYPES.find((v) => v.type === viz.type)?.icon}
                        </span>
                        <input
                          className="text-xs font-medium text-gray-700 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-indigo-400 outline-none px-0.5"
                          value={viz.title ?? ""}
                          onChange={(e) => updateVizTitle(viz.id, e.target.value)}
                          placeholder="Untitled"
                        />
                      </div>
                      <button
                        onClick={() => removeVisualization(viz.id)}
                        className="text-gray-400 hover:text-red-500 text-xs"
                        title="Remove visualization"
                      >
                        ✕
                      </button>
                    </div>

                    {viz.metric_ids.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center mt-4">
                        Drag a metric here
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {viz.metric_ids.map((mid) => {
                          const m = metrics.find((m) => m.id === mid);
                          return m ? (
                            <span
                              key={mid}
                              className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-xs"
                            >
                              {m.label ?? `${m.field} (${m.aggregation})`}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Filters */}
          <section className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Segment filters</h3>
              <button
                onClick={addFilter}
                className="text-xs text-indigo-600 border border-indigo-300 rounded px-2 py-1 hover:bg-indigo-50"
              >
                + Add filter
              </button>
            </div>
            {filters.length === 0 ? (
              <p className="text-xs text-gray-400">No filters applied</p>
            ) : (
              <div className="space-y-2">
                {filters.map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className="flex-1 border rounded px-2 py-1 text-xs"
                      placeholder="field"
                      value={f.field}
                      onChange={(e) => updateFilter(i, { field: e.target.value })}
                    />
                    <select
                      className="border rounded px-2 py-1 text-xs"
                      value={f.operator}
                      onChange={(e) =>
                        updateFilter(i, { operator: e.target.value as ReportFilter["operator"] })
                      }
                    >
                      <option value="eq">equals</option>
                      <option value="neq">not equals</option>
                      <option value="gt">greater than</option>
                      <option value="gte">≥</option>
                      <option value="lt">less than</option>
                      <option value="lte">≤</option>
                      <option value="in">in</option>
                      <option value="between">between</option>
                    </select>
                    <input
                      className="flex-1 border rounded px-2 py-1 text-xs"
                      placeholder="value"
                      value={f.value}
                      onChange={(e) => updateFilter(i, { value: e.target.value })}
                    />
                    <button
                      onClick={() => removeFilter(i)}
                      className="text-gray-400 hover:text-red-500 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
