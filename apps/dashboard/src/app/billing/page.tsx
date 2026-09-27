"use client";

const PLANS = [
  { name: "Starter", price: 99, features: ["5,000 contacts", "10,000 emails/mo", "Basic chatbot", "Email support"], current: false },
  { name: "Growth", price: 299, features: ["25,000 contacts", "100,000 emails/mo", "AI chatbot", "Call engine", "Priority support"], current: true },
  { name: "Enterprise", price: 999, features: ["Unlimited contacts", "Unlimited emails", "Voice AI", "White-label", "Dedicated support"], current: false },
];

const INVOICES = [
  { id: "INV-001", date: "Apr 1, 2026", amount: 299, status: "paid" },
  { id: "INV-002", date: "Mar 1, 2026", amount: 299, status: "paid" },
  { id: "INV-003", date: "Feb 1, 2026", amount: 299, status: "paid" },
];

const USAGE = [
  { resource: "Contacts", used: 8420, limit: 25000, color: "bg-blue-500" },
  { resource: "Emails Sent", used: 42100, limit: 100000, color: "bg-purple-500" },
  { resource: "Call Minutes", used: 340, limit: 1000, color: "bg-emerald-500" },
  { resource: "AI Tokens", used: 125000, limit: 500000, color: "bg-amber-500" },
];

export default function BillingPage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto page-enter">
      <div>
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your subscription and usage</p>
      </div>

      {/* Current plan */}
      <div className="glass-card p-5 border border-indigo-500/20 bg-indigo-500/5">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-lg font-bold text-white">Growth Plan</p>
              <span className="badge badge-green">Active</span>
            </div>
            <p className="text-sm text-slate-400 mt-1">$299/month · Renews May 1, 2026</p>
          </div>
          <button className="btn-secondary">Change Plan</button>
        </div>
      </div>

      {/* Usage */}
      <div className="glass-card p-5">
        <p className="text-sm font-semibold text-white mb-4">Current Period Usage</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {USAGE.map((u) => (
            <div key={u.resource}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-sm text-slate-300">{u.resource}</p>
                <p className="text-xs text-slate-500">{u.used.toLocaleString()} / {u.limit.toLocaleString()}</p>
              </div>
              <div className="h-2 bg-white/[0.06] rounded-full">
                <div
                  className={`h-full rounded-full ${u.color} transition-all`}
                  style={{ width: `${(u.used / u.limit) * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-600 mt-1">{Math.round((u.used / u.limit) * 100)}% used</p>
            </div>
          ))}
        </div>
      </div>

      {/* Plans */}
      <div>
        <p className="text-sm font-semibold text-white mb-3">Available Plans</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PLANS.map((plan) => (
            <div key={plan.name} className={`glass-card p-5 ${plan.current ? "border border-indigo-500/30 bg-indigo-500/5" : ""}`}>
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-white">{plan.name}</p>
                {plan.current && <span className="badge badge-green">Current</span>}
              </div>
              <p className="text-2xl font-bold text-white mb-4">${plan.price}<span className="text-sm text-slate-500 font-normal">/mo</span></p>
              <ul className="space-y-2 mb-5">
                {plan.features.map((f) => (
                  <li key={f} className="text-xs text-slate-400 flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> {f}
                  </li>
                ))}
              </ul>
              <button className={plan.current ? "btn-secondary w-full" : "btn-primary w-full"}>
                {plan.current ? "Current Plan" : "Upgrade"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Invoices */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <p className="text-sm font-semibold text-white">Invoice History</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {["Invoice", "Date", "Amount", "Status", ""].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INVOICES.map((inv) => (
              <tr key={inv.id} className="table-row">
                <td className="px-5 py-3.5 text-white font-mono text-xs">{inv.id}</td>
                <td className="px-5 py-3.5 text-slate-400">{inv.date}</td>
                <td className="px-5 py-3.5 text-white">${inv.amount}</td>
                <td className="px-5 py-3.5"><span className="badge badge-green">{inv.status}</span></td>
                <td className="px-5 py-3.5"><button className="text-xs text-indigo-400 hover:text-indigo-300">Download PDF</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
