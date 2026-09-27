"use client";
import { useState } from "react";

const TOUCHPOINTS = [
  { channel: "Email", credit: 35, conversions: 12, color: "bg-blue-500" },
  { channel: "Campaign Click", credit: 28, conversions: 9, color: "bg-purple-500" },
  { channel: "Call", credit: 22, conversions: 7, color: "bg-emerald-500" },
  { channel: "Chatbot", credit: 15, conversions: 5, color: "bg-amber-500" },
];

const MODELS = ["first_touch", "last_touch", "linear"];

export default function AttributionPage() {
  const [model, setModel] = useState("linear");

  return (
    <div className="space-y-5 max-w-7xl mx-auto page-enter">
      <div>
        <h1 className="text-2xl font-bold text-white">Attribution Engine</h1>
        <p className="text-sm text-slate-500 mt-0.5">Cross-channel conversion credit analysis</p>
      </div>

      {/* Model selector */}
      <div className="glass-card p-4 flex items-center gap-4">
        <p className="text-sm text-slate-400">Attribution Model:</p>
        <div className="flex gap-1">
          {MODELS.map((m) => (
            <button
              key={m}
              onClick={() => setModel(m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                model === m ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/20" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {m.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Channel breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {TOUCHPOINTS.map((t) => (
          <div key={t.channel} className="glass-card p-5">
            <p className="text-sm font-medium text-white mb-3">{t.channel}</p>
            <div className="flex items-end gap-2 mb-3">
              <p className="stat-value text-2xl">{t.credit}%</p>
              <p className="text-xs text-slate-500 mb-1">credit</p>
            </div>
            <div className="h-1.5 bg-white/[0.06] rounded-full mb-3">
              <div className={`h-full rounded-full ${t.color}`} style={{ width: `${t.credit}%` }} />
            </div>
            <p className="text-xs text-slate-500">{t.conversions} conversions</p>
          </div>
        ))}
      </div>

      {/* Attribution table */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <p className="text-sm font-semibold text-white">Recent Conversions</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {["Contact", "Conversion", "Touchpoints", "Model", "Date"].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { contact: "David Kim", event: "Deal Closed Won", touchpoints: 4, date: "Today" },
              { contact: "Alice Johnson", event: "Deal Closed Won", touchpoints: 3, date: "Yesterday" },
              { contact: "Eva Chen", event: "Form Submitted", touchpoints: 2, date: "Apr 3" },
            ].map((r, i) => (
              <tr key={i} className="table-row">
                <td className="px-5 py-3.5 text-white">{r.contact}</td>
                <td className="px-5 py-3.5"><span className="badge badge-green">{r.event}</span></td>
                <td className="px-5 py-3.5 text-slate-400">{r.touchpoints} touchpoints</td>
                <td className="px-5 py-3.5"><span className="badge badge-blue">{model.replace("_", " ")}</span></td>
                <td className="px-5 py-3.5 text-slate-500">{r.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
