"use client";
export default function CallsPage() {
  return (
    <div className="space-y-5 max-w-7xl mx-auto page-enter">
      <div>
        <h1 className="text-2xl font-bold text-white">Call Engine</h1>
        <p className="text-sm text-slate-500 mt-0.5">Inbound, outbound, and AI-powered voice calls</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Calls Today", value: "0", icon: "📞", color: "from-emerald-500/10 to-emerald-600/5 border-emerald-500/15" },
          { label: "Avg Duration", value: "—", icon: "⏱", color: "from-blue-500/10 to-blue-600/5 border-blue-500/15" },
          { label: "Voicemails", value: "0", icon: "📬", color: "from-purple-500/10 to-purple-600/5 border-purple-500/15" },
        ].map((c) => (
          <div key={c.label} className={`glass-card p-5 bg-gradient-to-br ${c.color}`}>
            <div className="text-2xl mb-3">{c.icon}</div>
            <p className="stat-value">{c.value}</p>
            <p className="text-sm text-slate-400 mt-1">{c.label}</p>
          </div>
        ))}
      </div>
      <div className="glass-card p-8 flex flex-col items-center justify-center text-center gap-3">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-3xl">📞</div>
        <p className="text-white font-semibold">No calls yet</p>
        <p className="text-sm text-slate-500">Start a call or configure your Twilio integration to begin</p>
        <button className="btn-primary mt-2">Start Outbound Call</button>
      </div>
    </div>
  );
}
