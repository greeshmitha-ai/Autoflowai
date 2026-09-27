"use client";
import { useState } from "react";

const AGENTS = [
  { id: "1", name: "Support Bot", persona: "Friendly customer support agent", channels: ["widget", "whatsapp"], threshold: 0.5, status: "active" },
  { id: "2", name: "Sales Assistant", persona: "Proactive sales qualification agent", channels: ["widget", "facebook"], threshold: 0.6, status: "active" },
  { id: "3", name: "Onboarding Guide", persona: "Helpful onboarding assistant", channels: ["widget"], threshold: 0.4, status: "inactive" },
];

const CHANNEL_ICONS: Record<string, string> = {
  widget: "🌐", whatsapp: "📱", facebook: "📘", sms: "💬",
};

export default function ChatbotPage() {
  const [showModal, setShowModal] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  const [testReply, setTestReply] = useState("");

  const handleTest = () => {
    if (!testMsg.trim()) return;
    setTestReply("Hello! I'm your AI assistant. I received your message: \"" + testMsg + "\". How can I help you further?");
    setTestMsg("");
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Chatbot Engine</h1>
          <p className="text-sm text-slate-500 mt-0.5">AI agents deployed across your channels</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ New Agent</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Agents */}
        <div className="lg:col-span-2 space-y-3">
          {AGENTS.map((agent) => (
            <div key={agent.id} className="glass-card-hover p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center text-xl">🤖</div>
                  <div>
                    <p className="font-semibold text-white">{agent.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{agent.persona}</p>
                  </div>
                </div>
                <span className={`badge ${agent.status === "active" ? "badge-green" : "badge-purple"}`}>{agent.status}</span>
              </div>
              <div className="mt-4 flex items-center gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Channels</p>
                  <div className="flex gap-1">
                    {agent.channels.map((c) => (
                      <span key={c} className="text-sm" title={c}>{CHANNEL_ICONS[c]}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Escalation Threshold</p>
                  <p className="text-sm text-white font-medium">{(agent.threshold * 100).toFixed(0)}%</p>
                </div>
                <div className="ml-auto flex gap-2">
                  <button className="btn-secondary text-xs px-3 py-1.5">Configure</button>
                  <button className="btn-secondary text-xs px-3 py-1.5">Knowledge Base</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Test widget */}
        <div className="glass-card flex flex-col h-80">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <p className="text-sm font-semibold text-white">Test Agent</p>
            <p className="text-xs text-slate-500">Support Bot</p>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center text-sm flex-shrink-0">🤖</div>
              <div className="bg-white/[0.06] rounded-xl px-3 py-2 text-xs text-slate-300">
                Hi! I'm Support Bot. How can I help you today?
              </div>
            </div>
            {testReply && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center text-sm flex-shrink-0">🤖</div>
                <div className="bg-white/[0.06] rounded-xl px-3 py-2 text-xs text-slate-300">{testReply}</div>
              </div>
            )}
          </div>
          <div className="p-3 border-t border-white/[0.06] flex gap-2">
            <input
              className="input-field flex-1 text-xs py-1.5"
              placeholder="Test a message…"
              value={testMsg}
              onChange={(e) => setTestMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTest()}
            />
            <button className="btn-primary text-xs px-3 py-1.5" onClick={handleTest}>Send</button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md p-6 space-y-4 mx-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">New Agent</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white text-xl">✕</button>
            </div>
            {["Agent Name", "Persona Description"].map((f) => (
              <div key={f}>
                <label className="text-xs text-slate-400 mb-1 block">{f}</label>
                <input className="input-field" placeholder={f} />
              </div>
            ))}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Escalation Threshold</label>
              <input type="range" min="0" max="100" defaultValue="50" className="w-full accent-indigo-500" />
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn-primary flex-1">Create Agent</button>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
