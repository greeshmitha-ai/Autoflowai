"use client";
import { useState } from "react";

const SURVEYS = [
  { id: "1", name: "Post-Call Survey", status: "published", responses: 142, nps: 67, sentiment: { positive: 78, neutral: 15, negative: 7 } },
  { id: "2", name: "Onboarding Feedback", status: "published", responses: 89, nps: 54, sentiment: { positive: 62, neutral: 24, negative: 14 } },
  { id: "3", name: "Q2 Product Survey", status: "draft", responses: 0, nps: 0, sentiment: { positive: 0, neutral: 0, negative: 0 } },
];

const RESPONSES = [
  { contact: "Alice J.", score: 9, sentiment: "positive", text: "Great service, very responsive team!", time: "2h ago" },
  { contact: "Bob M.", score: 7, sentiment: "neutral", text: "Good overall but could improve response times.", time: "4h ago" },
  { contact: "Carol W.", score: 4, sentiment: "negative", text: "Had trouble with the integration setup.", time: "6h ago" },
  { contact: "David K.", score: 10, sentiment: "positive", text: "Excellent product, exactly what we needed!", time: "8h ago" },
];

const SENTIMENT_COLORS: Record<string, string> = {
  positive: "badge-green", neutral: "badge-yellow", negative: "badge-red",
};

export default function FeedbackPage() {
  const [activeTab, setActiveTab] = useState("surveys");

  return (
    <div className="space-y-5 max-w-7xl mx-auto page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Feedback Engine</h1>
          <p className="text-sm text-slate-500 mt-0.5">Surveys, NPS, and sentiment analysis</p>
        </div>
        <button className="btn-primary">+ New Survey</button>
      </div>

      {/* NPS overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card p-5 text-center">
          <p className="text-4xl font-bold text-gradient">67</p>
          <p className="text-sm text-slate-400 mt-2">Net Promoter Score</p>
          <span className="badge badge-green mt-2">Good</span>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs text-slate-500 mb-3 uppercase tracking-wide">Sentiment Breakdown</p>
          <div className="space-y-2">
            {[
              { label: "Positive", pct: 72, color: "bg-emerald-500" },
              { label: "Neutral", pct: 18, color: "bg-amber-500" },
              { label: "Negative", pct: 10, color: "bg-red-500" },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-16">{s.label}</span>
                <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full">
                  <div className={`h-full rounded-full ${s.color}`} style={{ width: `${s.pct}%` }} />
                </div>
                <span className="text-xs text-slate-400 w-8 text-right">{s.pct}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="glass-card p-5">
          <p className="text-xs text-slate-500 mb-3 uppercase tracking-wide">Total Responses</p>
          <p className="stat-value text-3xl">231</p>
          <p className="text-xs text-slate-500 mt-2">Across 2 active surveys</p>
          <p className="stat-change-up mt-2">↑ +18 this week</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 glass-card p-1 w-fit">
        {["surveys", "responses"].map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              activeTab === t ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/20" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTab === "surveys" && (
        <div className="space-y-3">
          {SURVEYS.map((s) => (
            <div key={s.id} className="glass-card-hover p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">{s.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.responses} responses</p>
                </div>
                <div className="flex items-center gap-3">
                  {s.status === "published" && (
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">{s.nps}</p>
                      <p className="text-[10px] text-slate-500">NPS</p>
                    </div>
                  )}
                  <span className={`badge ${s.status === "published" ? "badge-green" : "badge-purple"}`}>{s.status}</span>
                  <button className="btn-secondary text-xs px-3 py-1.5">View</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "responses" && (
        <div className="space-y-3">
          {RESPONSES.map((r, i) => (
            <div key={i} className="glass-card p-4 flex items-start gap-4">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {r.contact[0]}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-medium text-white">{r.contact}</p>
                  <span className={`badge ${SENTIMENT_COLORS[r.sentiment]}`}>{r.sentiment}</span>
                  <span className="text-xs text-slate-500 ml-auto">{r.time}</span>
                </div>
                <p className="text-sm text-slate-300">{r.text}</p>
              </div>
              <div className="text-center flex-shrink-0">
                <p className={`text-lg font-bold ${r.score >= 9 ? "text-emerald-400" : r.score >= 7 ? "text-amber-400" : "text-red-400"}`}>{r.score}</p>
                <p className="text-[10px] text-slate-500">/ 10</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
