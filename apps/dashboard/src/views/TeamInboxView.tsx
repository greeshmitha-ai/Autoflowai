"use client";

import { useState } from "react";

const THREADS = [
  { id: "1", user: "Alice Johnson",  preview: "I need to cancel my subscription please.", source: "Email",  time: "1m",  unread: true },
  { id: "2", user: "Bob Martinez",   preview: "Thanks! The issue is resolved now.",         source: "Chat",   time: "5m",  unread: false },
  { id: "3", user: "Carol White",    preview: "Can you help me set up the integration?",   source: "SMS",    time: "12m", unread: true },
  { id: "4", user: "David Kim",      preview: "When will the new feature be available?",   source: "Email",  time: "1h",  unread: false },
  { id: "5", user: "Eva Chen",       preview: "Your support team is amazing!",             source: "Chat",   time: "2h",  unread: false },
];

const HISTORY: Record<string, { from: string; text: string; time: string }[]> = {
  "1": [
    { from: "user", text: "Hi, I need to cancel my subscription please.", time: "11:01" },
    { from: "agent", text: "Hi Alice! I'm sorry to hear that. Can you share the reason for cancellation?", time: "11:02" },
    { from: "user", text: "I'm switching to a competitor, but I might come back.", time: "11:03" },
  ],
  "2": [
    { from: "user", text: "Hey, my automation workflows stopped working.", time: "10:48" },
    { from: "agent", text: "I'll investigate that right now for you, Bob.", time: "10:49" },
    { from: "user", text: "Thanks! The issue is resolved now.", time: "10:55" },
  ],
};

const SOURCE_BADGE: Record<string, string> = { Email: "badge-purple", Chat: "badge-blue", SMS: "badge-green" };

export function TeamInboxView() {
  const [tab, setTab] = useState<"all" | "email" | "chat" | "sms">("all");
  const [selected, setSelected] = useState<string>("1");
  const [reply, setReply] = useState("");
  const [messages, setMessages] = useState(HISTORY);

  const filtered = THREADS.filter(t =>
    tab === "all" || t.source.toLowerCase() === tab
  );

  const thread = THREADS.find(t => t.id === selected);
  const threadMessages = messages[selected] ?? [];

  const sendReply = () => {
    if (!reply.trim() || !selected) return;
    const msg = { from: "agent", text: reply, time: new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }) };
    setMessages(m => ({ ...m, [selected]: [...(m[selected] ?? []), msg] }));
    setReply("");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Team Inbox</h1>
          <p className="page-sub">Unified conversation queue across all channels</p>
        </div>
        <span className="badge badge-blue">{THREADS.filter(t => t.unread).length} Unread</span>
      </div>

      <div className="glass-card overflow-hidden flex flex-col lg:flex-row" style={{ minHeight: 480 }}>
        {/* Left panel */}
        <div className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-white/[0.06] flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-white/[0.06]">
            {(["all","email","chat","sms"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-xs font-medium capitalize transition-colors ${tab === t ? "text-indigo-400 border-b-2 border-indigo-500" : "text-slate-500 hover:text-slate-300"}`}>
                {t}
              </button>
            ))}
          </div>
          {/* Thread list */}
          <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
            {filtered.map(t => (
              <button key={t.id} onClick={() => setSelected(t.id)}
                className={`w-full text-left px-4 py-3 hover:bg-white/[0.03] transition-colors ${selected === t.id ? "bg-indigo-500/10 border-l-2 border-indigo-500" : ""}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {t.unread && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />}
                    <p className={`text-sm ${t.unread ? "font-semibold text-white" : "font-medium text-slate-300"}`}>{t.user}</p>
                  </div>
                  <span className="text-[10px] text-slate-500">{t.time}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge text-[10px] py-0 ${SOURCE_BADGE[t.source]}`}>{t.source}</span>
                  <p className="text-xs text-slate-500 truncate">{t.preview}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right panel — conversation */}
        <div className="flex-1 flex flex-col">
          {thread ? (
            <>
              <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">{thread.user[0]}</div>
                  <div>
                    <p className="text-sm font-medium text-white">{thread.user}</p>
                    <span className={`badge text-[10px] ${SOURCE_BADGE[thread.source]}`}>{thread.source}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn-icon text-xs" title="Assign">👤</button>
                  <button className="btn-icon text-xs" title="Resolve">✅</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {threadMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.from === "user" ? "justify-start" : "justify-end"}`}>
                    <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${m.from === "user" ? "bg-white/[0.06] text-slate-300 rounded-bl-sm" : "bg-indigo-600 text-white rounded-br-sm"}`}>
                      {m.text}
                      <p className="text-[10px] opacity-60 mt-1">{m.time}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-3 border-t border-white/[0.06] flex gap-2">
                <input className="input-field flex-1 text-xs py-2" placeholder="Type a reply…"
                  value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === "Enter" && sendReply()} />
                <button className="btn-primary px-3 text-xs" onClick={sendReply}>Send</button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Select a conversation</div>
          )}
        </div>
      </div>
    </div>
  );
}
