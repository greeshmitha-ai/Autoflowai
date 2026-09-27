"use client";
import { useState } from "react";

const CONVERSATIONS = [
  { id: "1", contact: "Alice Johnson", channel: "live_chat", preview: "Hi, I need help with my account settings", time: "2m ago", status: "open", unread: 3 },
  { id: "2", contact: "Bob Martinez", channel: "email", preview: "Following up on our last conversation about pricing", time: "15m ago", status: "pending", unread: 1 },
  { id: "3", contact: "Carol White", channel: "whatsapp", preview: "Can you send me the onboarding guide?", time: "1h ago", status: "open", unread: 0 },
  { id: "4", contact: "David Kim", channel: "sms", preview: "Thanks for the quick response!", time: "2h ago", status: "resolved", unread: 0 },
  { id: "5", contact: "Eva Chen", channel: "live_chat", preview: "I'm having trouble with the integration", time: "3h ago", status: "open", unread: 2 },
];

const CHANNEL_ICONS: Record<string, string> = {
  live_chat: "💬", email: "📧", whatsapp: "📱", sms: "💬", facebook: "📘",
};

const STATUS_COLORS: Record<string, string> = {
  open: "badge-blue", pending: "badge-yellow", resolved: "badge-green", snoozed: "badge-purple",
};

export default function TeamInboxPage() {
  const [selected, setSelected] = useState<string | null>("1");
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");

  const filtered = CONVERSATIONS.filter((c) => filter === "all" || c.status === filter);
  const active = CONVERSATIONS.find((c) => c.id === selected);

  return (
    <div className="max-w-7xl mx-auto page-enter">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Team Inbox</h1>
          <p className="text-sm text-slate-500 mt-0.5">All channels in one place</p>
        </div>
      </div>

      <div className="glass-card overflow-hidden flex h-[calc(100vh-200px)]">
        {/* Conversation list */}
        <div className="w-80 flex-shrink-0 border-r border-white/[0.06] flex flex-col">
          {/* Filters */}
          <div className="p-3 border-b border-white/[0.06] flex gap-1">
            {["all", "open", "pending", "resolved"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  filter === f ? "bg-indigo-600/20 text-indigo-400 border border-indigo-500/20" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {filtered.map((conv) => (
              <div
                key={conv.id}
                onClick={() => setSelected(conv.id)}
                className={`p-4 border-b border-white/[0.04] cursor-pointer transition-colors ${
                  selected === conv.id ? "bg-indigo-600/10 border-l-2 border-l-indigo-500" : "hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {conv.contact[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-white truncate">{conv.contact}</p>
                      <span className="text-[10px] text-slate-600 flex-shrink-0 ml-2">{conv.time}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs">{CHANNEL_ICONS[conv.channel]}</span>
                      <p className="text-xs text-slate-500 truncate">{conv.preview}</p>
                    </div>
                  </div>
                  {conv.unread > 0 && (
                    <span className="w-5 h-5 rounded-full bg-indigo-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {conv.unread}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat area */}
        {active ? (
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                  {active.contact[0]}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{active.contact}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    {CHANNEL_ICONS[active.channel]} via {active.channel.replace("_", " ")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${STATUS_COLORS[active.status]}`}>{active.status}</span>
                <button className="btn-secondary text-xs px-3 py-1.5">Resolve</button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {active.contact[0]}
                </div>
                <div className="bg-white/[0.06] rounded-2xl rounded-tl-sm px-4 py-3 max-w-sm">
                  <p className="text-sm text-slate-200">{active.preview}</p>
                  <p className="text-[10px] text-slate-600 mt-1">{active.time}</p>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <div className="bg-indigo-600/30 border border-indigo-500/20 rounded-2xl rounded-tr-sm px-4 py-3 max-w-sm">
                  <p className="text-sm text-slate-200">Thanks for reaching out! I'll look into this right away.</p>
                  <p className="text-[10px] text-slate-500 mt-1">1m ago · You</p>
                </div>
              </div>
            </div>

            {/* Input */}
            <div className="p-4 border-t border-white/[0.06]">
              <div className="flex gap-3">
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
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-500">
            Select a conversation
          </div>
        )}
      </div>
    </div>
  );
}
