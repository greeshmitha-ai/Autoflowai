"use client";

const INVOICES = [
  { id: "INV-0012", date: "Apr 1, 2026",  amount: "$299.00", status: "Paid" },
  { id: "INV-0011", date: "Mar 1, 2026",  amount: "$299.00", status: "Paid" },
  { id: "INV-0010", date: "Feb 1, 2026",  amount: "$299.00", status: "Paid" },
  { id: "INV-0009", date: "Jan 1, 2026",  amount: "$249.00", status: "Paid" },
];

const FEATURES = [
  "Unlimited contacts", "25 active automations", "10,000 emails/month",
  "AI chatbot (unlimited)", "Priority support", "Custom reports",
];

export function BillingView() {
  const usagePct = 68;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="page-sub">Subscription, usage, and invoices</p>
        </div>
        <button className="btn-primary">Upgrade Plan</button>
      </div>

      {/* Current plan */}
      <div className="glass-card p-6 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border-indigo-500/20">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl font-bold text-white">Pro Plan</span>
              <span className="badge badge-purple">Current</span>
            </div>
            <p className="text-3xl font-bold text-white mt-2">$299<span className="text-sm font-normal text-slate-400">/month</span></p>
            <p className="text-xs text-slate-400 mt-1">Renews May 1, 2026 · Cancel anytime</p>
          </div>
          <div className="flex flex-col gap-2">
            {FEATURES.map(f => (
              <div key={f} className="flex items-center gap-2">
                <span className="text-emerald-400 text-xs">✓</span>
                <span className="text-xs text-slate-300">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Usage */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Usage This Month</h2>
        <div className="space-y-4">
          {[
            { label: "Emails Sent",      used: 6_800,   total: 10_000,  unit: "emails",    pct: 68 },
            { label: "Automations",      used: 18,       total: 25,      unit: "active",    pct: 72 },
            { label: "Contacts",         used: 1_240,    total: null,    unit: "unlimited", pct: 0 },
            { label: "API Calls",        used: 84_200,   total: 200_000, unit: "calls",     pct: 42 },
          ].map(item => (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-slate-400">{item.label}</span>
                <span className="text-xs text-slate-400 tabular-nums">
                  {item.total
                    ? `${item.used.toLocaleString()} / ${item.total.toLocaleString()} ${item.unit}`
                    : `${item.used.toLocaleString()} ${item.unit}`}
                </span>
              </div>
              {item.total && (
                <div className="progress-bar">
                  <div className={`progress-fill ${item.pct > 85 ? "from-red-500 to-rose-500" : item.pct > 65 ? "from-amber-500 to-yellow-500" : ""}`}
                    style={{ width: `${item.pct}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Invoices */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-white">Invoice History</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {["Invoice", "Date", "Amount", "Status", ""].map(h => (
                <th key={h} className="table-header">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INVOICES.map(inv => (
              <tr key={inv.id} className="table-row">
                <td className="table-cell font-mono text-slate-300">{inv.id}</td>
                <td className="table-cell text-slate-400">{inv.date}</td>
                <td className="table-cell font-medium text-white">{inv.amount}</td>
                <td className="table-cell"><span className="badge badge-green">{inv.status}</span></td>
                <td className="table-cell">
                  <button className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Download</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Upgrade CTA */}
      <div className="glass-card p-5 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/20 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-white">Need more capacity?</p>
          <p className="text-xs text-slate-400 mt-0.5">Upgrade to Enterprise for unlimited everything + dedicated support.</p>
        </div>
        <button className="btn-primary shrink-0">View Enterprise →</button>
      </div>
    </div>
  );
}
