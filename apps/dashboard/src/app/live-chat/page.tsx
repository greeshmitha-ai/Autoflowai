"use client";
import { useState } from "react";

const SESSIONS = [
  { id: "1", contact: "Alice Johnson", status: "active", operator: "You", messages: 8, started: "5m ago" },
  { id: "2", contact: "Bob Martinez", status: "waiting", operator: null, messages: 2, started: "12m ago" },
  { id: "3", contact: "Carol White", status: "active", operator: "Sarah K.", messages: 15, started: "25m ago" },
];

const CANNED = [
  "Hi! How can I help you today?",
  "I'll look into this right away.",
  "Could you please provide more details?",
  "Thank you for your patience.",
  "Is there anything else I can help you with?",
];

export default function LiveChatPage() {
  const [selected, setSelected] = useState("1");
  const [message, setMessage] = useState("");
  const [showCanned, setShowCanned] = useState(false);

  return (
    <div className="max-w-7xl mx-auto page-enter">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-white">Live Chat</h1>
        <p className="text-sm text-slate-500 mt-0.5">Real-time operator chat interface</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Sessions */}
        <div className="glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Active Sessions</p>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {SESSIONS.map((s) => (
              <div
                key={s.id}
                onClick={() => setSelected(s.id)}
                className={`p-4 cursor-pointer transition-colors ${selected === s.id ? "bg-indigo-600/10" : "hover:bg-white/[0.03]"}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-white">{s.contact}</p>
                  <span className={`badge ${s.status === "active" ? "badge-green" : "badge-yellow"}`}>{s.status}</span>
                </div>
                <p className="text-xs text-slate-500">{s.operator ? `Assigned to ${s.operator}` : "Unassigned"}</p>
                <p className="text-xs text-slate-600 mt-1">{s.messages} messages · {s.started}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Chat */}
        <div className="lg:col-span-3 glass-card flex flex-col h-[500px]">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold">A</div>
              <div>
                <p className="text-sm font-semibold text-white">Alice Johnson</p>
                <p className="text-xs text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" /> Online</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary text-xs px-3 py-1.5">Transfer</button>
              <button className="btn-secondary text-xs px-3 py-1.5">Close</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">A</div>
              <div className="bg-white/[0.06] rounded-2xl rounded-tl-sm px-4 py-3 max-w-sm">
                <p className="text-sm text-slate-200">Hi, I need help with my account settings</p>
                <p className="text-[10px] text-slate-600 mt-1">5m ago</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <div className="bg-indigo-600/30 border border-indigo-500/20 rounded-2xl rounded-tr-sm px-4 py-3 max-w-sm">
                <p className="text-sm text-slate-200">Hi Alice! I'll help you with that. Which settings are you trying to update?</p>
                <p className="text-[10px] text-slate-500 mt-1">4m ago · You</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">A</div>
              <div className="bg-white/[0.06] rounded-2xl rounded-tl-sm px-4 py-3 max-w-sm">
                <p className="text-sm text-slate-200">I'm trying to change my notification preferences but the save button isn't working</p>
                <p className="text-[10px] text-slate-600 mt-1">3m ago</p>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-white/[0.06] space-y-2">
            {showCanned && (
              <div className="glass-card p-3 space-y-1">
                <p className="text-xs text-slate-500 mb-2">Canned Responses</p>
                {CANNED.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => { setMessage(c); setShowCanned(false); }}
                    className="w-full text-left text-xs text-slate-300 hover:text-white px-2 py-1.5 rounded hover:bg-white/[0.05] transition-colors"
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setShowCanned(!showCanned)}
                className="btn-secondary text-xs px-3 py-2"
                title="Canned responses"
              >
                ⚡
              </button>
              <input
                className="input-field flex-1"
                placeholder="Type a message…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setMessage("")}
              />
              <button className="btn-primary px-4" onClick={() => setMessage("")}>Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
