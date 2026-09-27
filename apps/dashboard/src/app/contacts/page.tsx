"use client";
import { useState } from "react";

const CONTACTS = [
  { id: "1", name: "Alice Johnson", email: "alice@acme.com", company: "Acme Corp", stage: "Customer", score: 87, phone: "+1 555 0101" },
  { id: "2", name: "Bob Martinez", email: "bob@techco.io", company: "TechCo", stage: "Prospect", score: 62, phone: "+1 555 0102" },
  { id: "3", name: "Carol White", email: "carol@startup.ai", company: "Startup AI", stage: "Lead", score: 45, phone: "+1 555 0103" },
  { id: "4", name: "David Kim", email: "david@enterprise.com", company: "Enterprise Ltd", stage: "Customer", score: 91, phone: "+1 555 0104" },
  { id: "5", name: "Eva Chen", email: "eva@growth.co", company: "Growth Co", stage: "Prospect", score: 73, phone: "+1 555 0105" },
  { id: "6", name: "Frank Lee", email: "frank@digital.io", company: "Digital IO", stage: "Lead", score: 38, phone: "+1 555 0106" },
];

const STAGE_COLORS: Record<string, string> = {
  Customer: "badge-green",
  Prospect: "badge-blue",
  Lead: "badge-yellow",
  Churned: "badge-red",
};

export default function ContactsPage() {
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);

  const filtered = CONTACTS.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.company.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 max-w-7xl mx-auto page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Contacts</h1>
          <p className="text-sm text-slate-500 mt-0.5">{CONTACTS.length} total contacts</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary">Import CSV</button>
          <button className="btn-primary" onClick={() => setShowModal(true)}>+ New Contact</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total", value: "6", icon: "👥", color: "from-blue-500/10 to-blue-600/5 border-blue-500/15" },
          { label: "Customers", value: "2", icon: "✅", color: "from-emerald-500/10 to-emerald-600/5 border-emerald-500/15" },
          { label: "Prospects", value: "2", icon: "🎯", color: "from-purple-500/10 to-purple-600/5 border-purple-500/15" },
          { label: "Leads", value: "2", icon: "🌱", color: "from-amber-500/10 to-amber-600/5 border-amber-500/15" },
        ].map((s) => (
          <div key={s.label} className={`glass-card p-4 bg-gradient-to-br ${s.color}`}>
            <div className="text-xl mb-2">{s.icon}</div>
            <p className="stat-value text-xl">{s.value}</p>
            <p className="text-xs text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="glass-card p-4">
        <input
          type="text"
          placeholder="Search contacts by name, email, or company…"
          className="input-field"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {["Name", "Company", "Stage", "Lead Score", "Phone", "Actions"].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="table-row">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {c.name[0]}
                    </div>
                    <div>
                      <p className="font-medium text-white">{c.name}</p>
                      <p className="text-xs text-slate-500">{c.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-slate-300">{c.company}</td>
                <td className="px-5 py-3.5">
                  <span className={`badge ${STAGE_COLORS[c.stage] ?? "badge-blue"}`}>{c.stage}</span>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full w-16">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                        style={{ width: `${c.score}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400 tabular-nums">{c.score}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-slate-400 text-xs">{c.phone}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <button className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Edit</button>
                    <button className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Call</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-slate-500">No contacts found</div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md p-6 space-y-4 mx-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">New Contact</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white text-xl">✕</button>
            </div>
            {["Full Name", "Email", "Phone", "Company"].map((f) => (
              <div key={f}>
                <label className="text-xs text-slate-400 mb-1 block">{f}</label>
                <input className="input-field" placeholder={f} />
              </div>
            ))}
            <div className="flex gap-3 pt-2">
              <button className="btn-primary flex-1">Create Contact</button>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
