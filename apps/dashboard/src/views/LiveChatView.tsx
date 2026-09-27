"use client";

import { useState } from "react";

const QUEUE = [
  { id: "1", user: "Anonymous #1482", page: "/pricing",     wait: "0:42", status: "waiting"  as const },
  { id: "2", user: "Frank Lee",        page: "/dashboard",  wait: "1:15", status: "waiting"  as const },
  { id: "3", user: "Anonymous #2031", page: "/features",    wait: "2:03", status: "waiting"  as const },
];

const ACTIVE_CHATS = [
  { id: "4", user: "Alice Johnson",  page: "/billing",  duration: "4:22", status: "active" as const },
  { id: "5", user: "David Kim",      page: "/crm",      duration: "1:08", status: "active" as const },
];

const INITIAL_MSGS: Record<string, { from: string; text: string; time: string }[]> = {
  "4": [
    { from: "user",  text: "Hi! I want to upgrade my plan but I'm confused about the pricing.", time: "10:02" },
    { from: "agent", text: "Hi Alice! I'd be happy to help. Are you looking at the Pro or Enterprise plan?", time: "10:03" },
    { from: "user",  text: "Enterprise plan. What does it include?", time: "10:04" },
  ],
};

export function LiveChatView() {
  const [selected, setSelected] = useState<string | null>("4");
  const [msgs, setMsgs] = useState(INITIAL_MSGS);
  const [reply, setReply] = useState("");
  const [accepted, setAccepted] = useState<string[]>(["4", "5"]);

  const accept = (id: string) => setAccepted(a => [...a, id]);

  const send = () => {
    if (!reply.trim() || !selected) return;
    const msg = { from: "agent", text: reply, time: new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }) };
    setMsgs(m => ({ ...m, [selected]: [...(m[selected] ?? []), msg] }));
    setReply("");
  };

  const allChats = [...ACTIVE_CHATS, ...QUEUE.filter(q => accepted.includes(q.id)).map(q => ({ ...q, duration: q.wait, status: "active" as const }))];
  const currentChat = [...ACTIVE_CHATS, ...QUEUE].find(c => c.id === selected);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Live Chat</h1>
          <p className="page-sub">Operator interface and visitor queue</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot" />
          <span className="text-xs text-emerald-400 font-medium">Online</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "In Queue",      value: QUEUE.filter(q => !accepted.includes(q.id)).length, icon: "⏳", color: "from-amber-500/10 to-amber-600/5 border-amber-500/15" },
          { label: "Active Chats",  value: allChats.length,                                     icon: "💬", color: "from-blue-500/10 to-blue-600/5 border-blue-500/15" },
          { label: "Resolved Today",value: 14,                                                  icon: "✅", color: "from-emerald-500/10 to-emerald-600/5 border-emerald-500/15" },
          { label: "Avg Wait",      value: "1m 20s",                                            icon: "⏱", color: "from-purple-500/10 to-purple-600/5 border-purple-500/15" },
        ].map(s => (
          <div key={s.label} className={`glass-card p-4 bg-gradient-to-br ${s.color}`}>
            <div className="text-xl mb-2">{s.icon}</div>
            <p className="stat-value text-xl">{s.value}</p>
            <p className="text-xs text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Incoming queue */}
      {QUEUE.filter(q => !accepted.includes(q.id)).length > 0 && (
        <div className="glass-card p-4 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/20">
          <h2 className="text-sm font-semibold text-white mb-3">Incoming Queue</h2>
          <div className="space-y-2">
            {QUEUE.filter(q => !accepted.includes(q.id)).map(v => (
              <div key={v.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <div>
                  <p className="text-sm font-medium text-white">{v.user}</p>
                  <p className="text-xs text-slate-500">Viewing {v.page} · waiting {v.wait}</p>
                </div>
                <button className="btn-primary text-xs px-3 py-1.5" onClick={() => accept(v.id)}>Accept</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Split-pane */}
      <div className="glass-card overflow-hidden flex flex-col lg:flex-row" style={{ minHeight: 440 }}>
        {/* Chat list */}
        <div className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-white/[0.06]">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Active ({allChats.length})</p>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {allChats.map(chat => (
              <button key={chat.id} onClick={() => setSelected(chat.id)}
                className={`w-full text-left px-4 py-3 hover:bg-white/[0.03] transition-colors ${selected === chat.id ? "bg-indigo-500/10 border-l-2 border-indigo-500" : ""}`}>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot flex-shrink-0" />
                  <p className="text-sm font-medium text-white truncate">{chat.user}</p>
                </div>
                <p className="text-xs text-slate-500 pl-4">{chat.page} · {chat.duration}</p>
              </button>
            ))}
            {allChats.length === 0 && (
              <p className="px-4 py-6 text-xs text-slate-500 text-center">No active chats</p>
            )}
          </div>
        </div>

        {/* Conversation */}
        <div className="flex-1 flex flex-col">
          {currentChat && selected ? (
            <>
              <div className="px-5 py-3 border-b border-white/[0.06] flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{currentChat.user}</p>
                  <p className="text-xs text-slate-500">Viewing {currentChat.page}</p>
                </div>
                <div className="flex gap-2">
                  <button className="btn-icon text-xs" title="Transfer">🔀</button>
                  <button className="btn-icon text-xs" title="Resolve">✅</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {(msgs[selected] ?? [{ from: "user", text: "Hello! I need help.", time: new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }) }]).map((m, i) => (
                  <div key={i} className={`flex ${m.from === "agent" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${m.from === "agent" ? "bg-indigo-600 text-white rounded-br-sm" : "bg-white/[0.06] text-slate-300 rounded-bl-sm"}`}>
                      {m.text}
                      <p className="text-[10px] opacity-60 mt-1">{m.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 border-t border-white/[0.06] flex gap-2">
                <input className="input-field flex-1 text-xs py-2" placeholder="Reply to visitor…"
                  value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} />
                <button className="btn-primary px-3 text-xs" onClick={send}>Send</button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Select a chat to start</div>
          )}
        </div>
      </div>
    </div>
  );
}
