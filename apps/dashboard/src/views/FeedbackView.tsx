"use client";

import { useState } from "react";

const RESPONSES = [
  { id: "1", contact: "David Kim",   score: 9, category: "Promoter"  as const, comment: "Absolutely love the platform. Saves us hours every week!", time: "2h ago" },
  { id: "2", contact: "Alice Johnson", score: 7, category: "Passive"   as const, comment: "Good product, but could use better reporting tools.",          time: "5h ago" },
  { id: "3", contact: "Bob Martinez",  score: 4, category: "Detractor" as const, comment: "Had issues with the automation triggers, support was slow.",   time: "1d ago" },
  { id: "4", contact: "Eva Chen",      score: 10, category: "Promoter" as const, comment: "Best CRM tool we've used. Highly recommend!",                   time: "1d ago" },
  { id: "5", contact: "Carol White",   score: 6, category: "Passive"   as const, comment: "Decent tool. Missing some features we need.",                   time: "2d ago" },
];

const CAT_BADGE: Record<string, string> = {
  Promoter: "badge-green", Passive: "badge-yellow", Detractor: "badge-red",
};

const nps = 72;
const promoters = RESPONSES.filter(r => r.category === "Promoter").length;
const passives   = RESPONSES.filter(r => r.category === "Passive").length;
const detractors = RESPONSES.filter(r => r.category === "Detractor").length;

// NPS Gauge SVG
function NpsGauge({ score }: { score: number }) {
  const angle = -90 + (score / 100) * 180;
  const rad = (angle * Math.PI) / 180;
  const cx = 80, cy = 80, r = 60;
  const nx = cx + r * Math.cos(rad);
  const ny = cy + r * Math.sin(rad);
  return (
    <svg viewBox="0 0 160 100" className="w-full max-w-[180px]">
      <path d="M20 80 A60 60 0 0 1 140 80" stroke="#1e293b" strokeWidth="12" fill="none" strokeLinecap="round" />
      <path d="M20 80 A60 60 0 0 1 140 80" stroke="url(#gauge-grad)" strokeWidth="12" fill="none" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * 188} 188`} />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#818cf8" strokeWidth="3" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="5" fill="#6366f1" />
      <text x={cx} y="95" textAnchor="middle" fontSize="18" fontWeight="bold" fill="#f1f5f9">{score}</text>
      <defs>
        <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function FeedbackView() {
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Feedback</h1>
          <p className="page-sub">NPS dashboard, surveys, and response analysis</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ Create Survey</button>
      </div>

      {/* NPS + breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="glass-card p-5 flex flex-col items-center gap-3">
          <h2 className="text-sm font-semibold text-white self-start">NPS Score</h2>
          <NpsGauge score={nps} />
          <div className="grid grid-cols-3 gap-2 w-full mt-2">
            {[
              { label: "Promoters",  count: promoters,  color: "text-emerald-400" },
              { label: "Passives",   count: passives,   color: "text-amber-400" },
              { label: "Detractors", count: detractors, color: "text-red-400" },
            ].map(item => (
              <div key={item.label} className="text-center p-2 rounded-xl bg-white/[0.03]">
                <p className={`text-lg font-bold ${item.color}`}>{item.count}</p>
                <p className="text-[10px] text-slate-500">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Score distribution bar */}
        <div className="glass-card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-white mb-4">Score Distribution</h2>
          <div className="space-y-2">
            {[10,9,8,7,6,5,4,3,2,1].map(score => {
              const count = RESPONSES.filter(r => r.score === score).length;
              const pct = Math.round((count / RESPONSES.length) * 100);
              return (
                <div key={score} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-4 text-right tabular-nums">{score}</span>
                  <div className="flex-1 h-2 bg-white/[0.05] rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${score >= 9 ? "bg-emerald-400" : score >= 7 ? "bg-amber-400" : "bg-red-400"}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-slate-500 w-6 tabular-nums">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Responses */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-white">Recent Responses</h2>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {RESPONSES.map(r => (
            <div key={r.id} className="px-5 py-4 flex items-start gap-4 hover:bg-white/[0.02] transition-colors">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0 ${r.category === "Promoter" ? "bg-emerald-500/15 text-emerald-400" : r.category === "Detractor" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"}`}>
                {r.score}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-white">{r.contact}</p>
                  <span className={`badge ${CAT_BADGE[r.category]}`}>{r.category}</span>
                  <span className="text-[10px] text-slate-500 ml-auto">{r.time}</span>
                </div>
                <p className="text-sm text-slate-400 italic">"{r.comment}"</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Create Survey</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white text-xl">✕</button>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Survey Name</label>
              <input className="input-field" placeholder="e.g. Q2 Customer NPS" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Type</label>
              <select className="select-field"><option>NPS</option><option>CSAT</option><option>Custom</option></select>
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn-primary flex-1" onClick={() => setShowModal(false)}>Create Survey</button>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
