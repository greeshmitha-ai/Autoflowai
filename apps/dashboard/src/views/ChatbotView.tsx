"use client";

import { useState } from "react";

const CONVERSATIONS = [
  { id: "1", user: "Alice J.",  msg: "Hi, can I get help with my order?",       time: "Just now", unread: true,  status: "open" as const },
  { id: "2", user: "Bob M.",    msg: "Thanks for your quick response!",           time: "3m",       unread: false, status: "open" as const },
  { id: "3", user: "Carol W.",  msg: "I need to upgrade my plan.",               time: "7m",       unread: true,  status: "open" as const },
  { id: "4", user: "David K.",  msg: "What integrations do you support?",        time: "12m",      unread: false, status: "resolved" as const },
];

const BOT_CONFIG = [
  { label: "Greeting Message",        value: "Hi! I'm AutoFlow AI. How can I help you today?" },
  { label: "Fallback Response",       value: "I'm not sure about that. Let me connect you to an agent." },
  { label: "Escalation Threshold",    value: "3 unanswered questions" },
  { label: "Response Language",       value: "English (auto-detect)" },
];

const CHAT_MESSAGES = [
  { from: "bot",  text: "Hi! I'm AutoFlow AI. How can I help you today?",  time: "10:00" },
  { from: "user", text: "Hi, can I get help with my order?",                time: "10:01" },
  { from: "bot",  text: "Of course! Please share your order ID and I'll look into it right away.", time: "10:01" },
  { from: "user", text: "Order #AF-2048",                                   time: "10:02" },
];

export function ChatbotView() {
  const [selected, setSelected] = useState<string | null>("1");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState(CHAT_MESSAGES);
  const [typing, setTyping] = useState(false);

  const send = () => {
    if (!input.trim()) return;
    const userMsg = { from: "user" as const, text: input, time: new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }) };
    setMessages(m => [...m, userMsg]);
    setInput("");
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages(m => [...m, { from: "bot", text: "Thanks! I'll look into that for you right away.", time: new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }) }]);
    }, 1500);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Chatbot</h1>
          <p className="page-sub">AI agent configuration and live conversations</p>
        </div>
        <div className="flex gap-2">
          <span className="badge badge-green pulse-dot">● Live</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Active Chats",    value: CONVERSATIONS.filter(c => c.status === "open").length, icon: "💬", color: "from-blue-500/10 to-blue-600/5 border-blue-500/15" },
          { label: "Resolved Today",  value: 28,  icon: "✅", color: "from-emerald-500/10 to-emerald-600/5 border-emerald-500/15" },
          { label: "Avg Handle Time", value: "2m 14s", icon: "⏱", color: "from-purple-500/10 to-purple-600/5 border-purple-500/15" },
          { label: "Escalated",       value: 4,   icon: "🚨", color: "from-amber-500/10 to-amber-600/5 border-amber-500/15" },
        ].map(s => (
          <div key={s.label} className={`glass-card p-4 bg-gradient-to-br ${s.color}`}>
            <div className="text-xl mb-2">{s.icon}</div>
            <p className="stat-value text-xl">{s.value}</p>
            <p className="text-xs text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Chat panel + config */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Conversation list */}
        <div className="glass-card overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <h2 className="text-sm font-semibold text-white">Conversations</h2>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {CONVERSATIONS.map(conv => (
              <button
                key={conv.id}
                onClick={() => setSelected(conv.id)}
                className={`w-full text-left px-4 py-3 hover:bg-white/[0.03] transition-colors ${selected === conv.id ? "bg-indigo-500/10 border-l-2 border-indigo-500" : ""}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">{conv.user[0]}</div>
                    <span className="text-sm font-medium text-white">{conv.user}</span>
                  </div>
                  <span className="text-[10px] text-slate-500">{conv.time}</span>
                </div>
                <p className="text-xs text-slate-400 truncate pl-8">{conv.msg}</p>
                {conv.unread && <span className="ml-8 mt-1 inline-block w-1.5 h-1.5 rounded-full bg-indigo-400" />}
              </button>
            ))}
          </div>
        </div>

        {/* Chat window */}
        <div className="glass-card flex flex-col h-96 lg:h-auto lg:min-h-[400px]">
          <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">A</div>
            <span className="text-sm font-medium text-white">Alice J.</span>
            <span className="badge badge-green ml-auto">Open</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${m.from === "user" ? "bg-indigo-600 text-white rounded-br-sm" : "bg-white/[0.06] text-slate-300 rounded-bl-sm"}`}>
                  {m.text}
                  <p className="text-[10px] opacity-60 mt-1">{m.time}</p>
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="bg-white/[0.06] px-4 py-2.5 rounded-2xl rounded-bl-sm">
                  <div className="flex gap-1 items-center h-3">
                    {[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="p-3 border-t border-white/[0.06] flex gap-2">
            <input className="input-field flex-1 text-xs py-2" placeholder="Type a message…" value={input}
              onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} />
            <button className="btn-primary px-3 py-2 text-xs" onClick={send}>Send</button>
          </div>
        </div>

        {/* Bot config */}
        <div className="glass-card p-4 space-y-3">
          <h2 className="text-sm font-semibold text-white mb-3">Bot Configuration</h2>
          {BOT_CONFIG.map(cfg => (
            <div key={cfg.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{cfg.label}</p>
              <p className="text-xs text-slate-300">{cfg.value}</p>
            </div>
          ))}
          <button className="btn-secondary w-full text-xs mt-2">Edit Configuration</button>
        </div>
      </div>
    </div>
  );
}
