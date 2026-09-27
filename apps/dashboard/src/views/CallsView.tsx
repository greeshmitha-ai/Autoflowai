"use client";

import { useState } from "react";

const CALLS = [
  { id: "1", contact: "David Kim",    phone: "+1 555 0104", direction: "outbound" as const, duration: "4m 32s", outcome: "Connected",  time: "10:24 AM" },
  { id: "2", contact: "Alice Johnson", phone: "+1 555 0101", direction: "inbound"  as const, duration: "2m 11s", outcome: "Connected",  time: "10:08 AM" },
  { id: "3", contact: "Unknown",       phone: "+1 555 0199", direction: "inbound"  as const, duration: "—",      outcome: "Missed",     time: "09:52 AM" },
  { id: "4", contact: "Bob Martinez",  phone: "+1 555 0102", direction: "outbound" as const, duration: "6m 05s", outcome: "Voicemail", time: "09:31 AM" },
  { id: "5", contact: "Eva Chen",      phone: "+1 555 0105", direction: "outbound" as const, duration: "1m 48s", outcome: "Connected",  time: "09:10 AM" },
];

const OUTCOME_BADGE: Record<string, string> = {
  Connected: "badge-green", Missed: "badge-red", Voicemail: "badge-yellow",
};

export function CallsView() {
  const [activeCall, setActiveCall] = useState(false);
  const [callContact, setCallContact] = useState("");
  const [callSecs, setCallSecs] = useState(0);
  const [timer, setTimer] = useState<ReturnType<typeof setInterval> | null>(null);

  const startCall = (contact: string) => {
    if (timer) clearInterval(timer);
    setCallContact(contact);
    setActiveCall(true);
    setCallSecs(0);
    const t = setInterval(() => setCallSecs(s => s + 1), 1000);
    setTimer(t);
  };

  const endCall = () => {
    if (timer) clearInterval(timer);
    setActiveCall(false);
    setCallSecs(0);
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Calls</h1>
          <p className="page-sub">Call log, power dialer, and recordings</p>
        </div>
        <button className="btn-primary" onClick={() => startCall("New Number")}>📞 Start Call</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Calls Today", value: CALLS.length, icon: "📞", color: "from-blue-500/10 to-blue-600/5 border-blue-500/15" },
          { label: "Connected",   value: CALLS.filter(c => c.outcome === "Connected").length, icon: "✅", color: "from-emerald-500/10 to-emerald-600/5 border-emerald-500/15" },
          { label: "Avg Duration", value: "3m 12s", icon: "⏱", color: "from-purple-500/10 to-purple-600/5 border-purple-500/15" },
          { label: "Missed", value: CALLS.filter(c => c.outcome === "Missed").length, icon: "❌", color: "from-red-500/10 to-red-600/5 border-red-500/15" },
        ].map(s => (
          <div key={s.label} className={`glass-card p-4 bg-gradient-to-br ${s.color}`}>
            <div className="text-xl mb-2">{s.icon}</div>
            <p className="stat-value text-xl">{s.value}</p>
            <p className="text-xs text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {activeCall && (
        <div className="glass-card p-5 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-500/20 slide-up">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-2xl animate-pulse">📞</div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Active Call</p>
                <p className="text-base font-semibold text-white">{callContact}</p>
                <p className="text-2xl font-mono font-bold text-emerald-400 tabular-nums">{fmt(callSecs)}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button className="btn-icon" title="Mute">🔇</button>
              <button className="btn-icon" title="Hold">⏸</button>
              <button className="btn-danger" onClick={endCall}>End Call</button>
            </div>
          </div>
        </div>
      )}

      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-white">Call Log</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {["Contact", "Direction", "Duration", "Outcome", "Time", ""].map(h => (
                  <th key={h} className="table-header">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CALLS.map(c => (
                <tr key={c.id} className="table-row">
                  <td className="table-cell">
                    <p className="font-medium text-white">{c.contact}</p>
                    <p className="text-xs text-slate-500">{c.phone}</p>
                  </td>
                  <td className="table-cell">
                    <span className={`badge ${c.direction === "inbound" ? "badge-blue" : "badge-purple"}`}>
                      {c.direction === "inbound" ? "↓ Inbound" : "↑ Outbound"}
                    </span>
                  </td>
                  <td className="table-cell tabular-nums text-slate-400">{c.duration}</td>
                  <td className="table-cell"><span className={`badge ${OUTCOME_BADGE[c.outcome]}`}>{c.outcome}</span></td>
                  <td className="table-cell text-slate-500">{c.time}</td>
                  <td className="table-cell">
                    <button className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors" onClick={() => startCall(c.contact)}>
                      Call Back
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
