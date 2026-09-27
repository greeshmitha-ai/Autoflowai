"use client";

import { useState } from "react";

const WORKFLOWS = [
  { id: "1", name: "Lead Nurture Sequence",    status: "active"   as const, trigger: "contact.created",       runs: 142, lastRun: "2m ago" },
  { id: "2", name: "Re-engagement Campaign",   status: "active"   as const, trigger: "lead_score_threshold",  runs: 87,  lastRun: "14m ago" },
  { id: "3", name: "NPS Low Score Alert",      status: "inactive" as const, trigger: "survey.low_score",       runs: 23,  lastRun: "2d ago" },
  { id: "4", name: "Post-Call Follow-up",      status: "draft"    as const, trigger: "call.completed",         runs: 0,   lastRun: "Never" },
];

const STATUS_STYLES = {
  active:   "badge-green",
  inactive: "badge-yellow",
  draft:    "badge-gray",
};

const TRIGGER_LABELS: Record<string, string> = {
  "contact.created":       "Contact Created",
  "lead_score_threshold":  "Lead Score ≥ 70",
  "survey.low_score":      "NPS < 6",
  "call.completed":        "Call Completed",
  "campaign.opened":       "Campaign Opened",
};

export function AutomationView() {
  const [workflows, setWorkflows] = useState(WORKFLOWS);
  const [showBuilder, setShowBuilder] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTrigger, setNewTrigger] = useState("contact.created");

  const toggle = (id: string) => {
    setWorkflows((wf) =>
      wf.map((w) =>
        w.id === id
          ? { ...w, status: w.status === "active" ? "inactive" : "active" }
          : w
      ) as typeof WORKFLOWS
    );
  };

  const createWorkflow = () => {
    if (!newName.trim()) return;
    setWorkflows((wf) => [
      ...wf,
      {
        id: String(Date.now()),
        name: newName.trim(),
        status: "draft" as const,
        trigger: newTrigger,
        runs: 0,
        lastRun: "Never",
      },
    ]);
    setNewName("");
    setShowBuilder(false);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Automation</h1>
          <p className="page-sub">Build and manage AI-powered workflows</p>
        </div>
        <button className="btn-primary" onClick={() => setShowBuilder(true)}>
          ⚡ New Workflow
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Workflows",  value: workflows.length,                                  icon: "⚡", color: "from-purple-500/10 to-purple-600/5 border-purple-500/15" },
          { label: "Active",           value: workflows.filter(w => w.status === "active").length,  icon: "✅", color: "from-emerald-500/10 to-emerald-600/5 border-emerald-500/15" },
          { label: "Total Runs",       value: workflows.reduce((s, w) => s + w.runs, 0),          icon: "🔄", color: "from-blue-500/10 to-blue-600/5 border-blue-500/15" },
          { label: "Drafts",           value: workflows.filter(w => w.status === "draft").length,  icon: "📝", color: "from-amber-500/10 to-amber-600/5 border-amber-500/15" },
        ].map((s) => (
          <div key={s.label} className={`glass-card p-4 bg-gradient-to-br ${s.color}`}>
            <div className="text-xl mb-2">{s.icon}</div>
            <p className="stat-value text-xl">{s.value}</p>
            <p className="text-xs text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Workflow list */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-white">{workflows.length} Workflow{workflows.length !== 1 ? "s" : ""}</h2>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {workflows.map((wf) => (
            <div key={wf.id} className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors">
              {/* Status dot */}
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${wf.status === "active" ? "bg-emerald-400 pulse-dot" : wf.status === "inactive" ? "bg-amber-400" : "bg-slate-500"}`} />
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{wf.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">Trigger: {TRIGGER_LABELS[wf.trigger] ?? wf.trigger}</p>
              </div>
              {/* Runs */}
              <div className="hidden sm:block text-center">
                <p className="text-sm font-semibold text-white tabular-nums">{wf.runs.toLocaleString()}</p>
                <p className="text-[10px] text-slate-500">runs</p>
              </div>
              {/* Last run */}
              <div className="hidden md:block text-center">
                <p className="text-xs text-slate-400">{wf.lastRun}</p>
                <p className="text-[10px] text-slate-600">last run</p>
              </div>
              {/* Badge */}
              <span className={`badge ${STATUS_STYLES[wf.status]}`}>{wf.status}</span>
              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggle(wf.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all duration-150 border ${
                    wf.status === "active"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                  }`}
                >
                  {wf.status === "active" ? "Pause" : "Activate"}
                </button>
              </div>
            </div>
          ))}
          {workflows.length === 0 && (
            <div className="py-16 text-center text-slate-500 text-sm">
              No workflows yet. Create one to get started.
            </div>
          )}
        </div>
      </div>

      {/* New Workflow Modal */}
      {showBuilder && (
        <div className="modal-backdrop" onClick={() => setShowBuilder(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">New Workflow</h2>
              <button onClick={() => setShowBuilder(false)} className="text-slate-500 hover:text-white text-xl transition-colors">✕</button>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Workflow Name</label>
              <input className="input-field" placeholder="e.g. Lead Nurture Sequence" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Trigger Event</label>
              <select className="select-field" value={newTrigger} onChange={e => setNewTrigger(e.target.value)}>
                <option value="contact.created">Contact Created</option>
                <option value="contact.updated">Contact Updated</option>
                <option value="lead_score_threshold">Lead Score Threshold</option>
                <option value="survey.low_score">Survey Low Score</option>
                <option value="campaign.opened">Campaign Opened</option>
                <option value="call.completed">Call Completed</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn-primary flex-1" onClick={createWorkflow} disabled={!newName.trim()}>Create Workflow</button>
              <button className="btn-secondary" onClick={() => setShowBuilder(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
