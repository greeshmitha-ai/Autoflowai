"use client";
import { useState } from "react";

const STAGES = [
  { id: "lead", name: "Lead", prob: 10, color: "border-slate-500/30 bg-slate-500/5" },
  { id: "qualified", name: "Qualified", prob: 25, color: "border-blue-500/30 bg-blue-500/5" },
  { id: "proposal", name: "Proposal", prob: 50, color: "border-purple-500/30 bg-purple-500/5" },
  { id: "negotiation", name: "Negotiation", prob: 75, color: "border-amber-500/30 bg-amber-500/5" },
  { id: "closed", name: "Closed Won", prob: 100, color: "border-emerald-500/30 bg-emerald-500/5" },
];

const DEALS = [
  { id: "1", name: "Enterprise Plan", contact: "David Kim", value: 48000, stage: "negotiation" },
  { id: "2", name: "Growth Package", contact: "Alice Johnson", value: 12000, stage: "proposal" },
  { id: "3", name: "Starter Bundle", contact: "Bob Martinez", value: 3600, stage: "qualified" },
  { id: "4", name: "AI Automation Suite", contact: "Eva Chen", value: 24000, stage: "lead" },
  { id: "5", name: "Annual Contract", contact: "Carol White", value: 36000, stage: "closed" },
  { id: "6", name: "Team License", contact: "Frank Lee", value: 8400, stage: "proposal" },
];

export default function CRMPage() {
  const [showModal, setShowModal] = useState(false);

  const totalForecast = DEALS.reduce((sum, d) => {
    const stage = STAGES.find((s) => s.id === d.stage);
    return sum + (d.value * (stage?.prob ?? 0)) / 100;
  }, 0);

  return (
    <div className="space-y-5 max-w-7xl mx-auto page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">CRM Pipeline</h1>
          <p className="text-sm text-slate-500 mt-0.5">Weighted forecast: <span className="text-emerald-400 font-semibold">${totalForecast.toLocaleString()}</span></p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ New Deal</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Deals", value: DEALS.length, icon: "💼" },
          { label: "Pipeline Value", value: `$${DEALS.reduce((s, d) => s + d.value, 0).toLocaleString()}`, icon: "💰" },
          { label: "Weighted Forecast", value: `$${Math.round(totalForecast).toLocaleString()}`, icon: "📊" },
          { label: "Avg Deal Size", value: `$${Math.round(DEALS.reduce((s, d) => s + d.value, 0) / DEALS.length).toLocaleString()}`, icon: "📈" },
        ].map((s) => (
          <div key={s.label} className="glass-card p-4">
            <div className="text-xl mb-2">{s.icon}</div>
            <p className="stat-value text-xl">{s.value}</p>
            <p className="text-xs text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Kanban */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const stageDeals = DEALS.filter((d) => d.stage === stage.id);
          const stageValue = stageDeals.reduce((s, d) => s + d.value, 0);
          return (
            <div key={stage.id} className="flex-shrink-0 w-64">
              <div className={`rounded-xl border p-3 mb-3 ${stage.color}`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">{stage.name}</p>
                  <span className="badge badge-purple">{stage.prob}%</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">{stageDeals.length} deals · ${stageValue.toLocaleString()}</p>
              </div>
              <div className="space-y-2">
                {stageDeals.map((deal) => (
                  <div key={deal.id} className="glass-card-hover p-3 cursor-pointer">
                    <p className="text-sm font-medium text-white">{deal.name}</p>
                    <p className="text-xs text-slate-500 mt-1">{deal.contact}</p>
                    <p className="text-sm font-semibold text-emerald-400 mt-2">${deal.value.toLocaleString()}</p>
                  </div>
                ))}
                {stageDeals.length === 0 && (
                  <div className="border-2 border-dashed border-white/[0.06] rounded-xl p-4 text-center text-xs text-slate-600">
                    No deals
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md p-6 space-y-4 mx-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">New Deal</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white text-xl">✕</button>
            </div>
            {["Deal Name", "Contact", "Value ($)"].map((f) => (
              <div key={f}>
                <label className="text-xs text-slate-400 mb-1 block">{f}</label>
                <input className="input-field" placeholder={f} />
              </div>
            ))}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Stage</label>
              <select className="input-field">
                {STAGES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn-primary flex-1">Create Deal</button>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
