"use client";

import { useState } from "react";
import Link from "next/link";

const CAMPAIGNS = [
  { id: "1", name: "Q2 Product Launch",   channel: "Email", status: "sent"      as const, audience: 1240, openRate: 48.3, clickRate: 12.1, sent: "Apr 18" },
  { id: "2", name: "Welcome Series",      channel: "Email", status: "active"    as const, audience: 320,  openRate: 62.7, clickRate: 18.4, sent: "Ongoing" },
  { id: "3", name: "Re-engagement Blast", channel: "SMS",   status: "sent"      as const, audience: 890,  openRate: 71.2, clickRate: 9.8,  sent: "Apr 15" },
  { id: "4", name: "Summer Preview",      channel: "Email", status: "scheduled" as const, audience: 2100, openRate: 0,    clickRate: 0,    sent: "Apr 28" },
  { id: "5", name: "Feature Announce",    channel: "Email", status: "draft"     as const, audience: 0,    openRate: 0,    clickRate: 0,    sent: "—" },
];

const STATUS_BADGE: Record<string, string> = {
  sent: "badge-green", active: "badge-blue", scheduled: "badge-yellow", draft: "badge-gray",
};

const CHANNEL_BADGE: Record<string, string> = {
  Email: "badge-purple", SMS: "badge-blue", "In-app": "badge-green",
};

export function MarketingView() {
  const [campaigns, setCampaigns] = useState(CAMPAIGNS);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", channel: "Email", audience: "" });

  const createCampaign = () => {
    if (!form.name.trim()) return;
    setCampaigns(prev => [...prev, {
      id: String(Date.now()), name: form.name, channel: form.channel,
      status: "draft" as const, audience: Number(form.audience) || 0,
      openRate: 0, clickRate: 0, sent: "—",
    }]);
    setForm({ name: "", channel: "Email", audience: "" });
    setShowModal(false);
  };

  const totalSent = campaigns.filter(c => c.status === "sent" || c.status === "active")
    .reduce((s, c) => s + c.audience, 0);
  const avgOpen = campaigns.filter(c => c.openRate > 0)
    .reduce((s, c, _, arr) => s + c.openRate / arr.length, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Marketing</h1>
          <p className="page-sub">Campaigns, templates, and audience management</p>
        </div>
        <div className="flex gap-2">
          <Link href="/marketing/template-editor" className="btn-secondary">📄 Templates</Link>
          <button className="btn-primary" onClick={() => setShowModal(true)}>+ New Campaign</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Campaigns",  value: campaigns.length,              icon: "📣", color: "from-purple-500/10 to-purple-600/5 border-purple-500/15" },
          { label: "Contacts Reached", value: totalSent.toLocaleString(),    icon: "👥", color: "from-blue-500/10 to-blue-600/5 border-blue-500/15" },
          { label: "Avg Open Rate",    value: `${avgOpen.toFixed(1)}%`,       icon: "📬", color: "from-emerald-500/10 to-emerald-600/5 border-emerald-500/15" },
          { label: "Scheduled",        value: campaigns.filter(c => c.status === "scheduled").length, icon: "📅", color: "from-amber-500/10 to-amber-600/5 border-amber-500/15" },
        ].map(s => (
          <div key={s.label} className={`glass-card p-4 bg-gradient-to-br ${s.color}`}>
            <div className="text-xl mb-2">{s.icon}</div>
            <p className="stat-value text-xl">{s.value}</p>
            <p className="text-xs text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Campaigns table */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">All Campaigns</h2>
          <span className="text-xs text-slate-500">{campaigns.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {["Campaign", "Channel", "Status", "Audience", "Open Rate", "Click Rate", "Sent"].map(h => (
                  <th key={h} className="table-header">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id} className="table-row">
                  <td className="table-cell font-medium text-white">{c.name}</td>
                  <td className="table-cell"><span className={`badge ${CHANNEL_BADGE[c.channel] ?? "badge-gray"}`}>{c.channel}</span></td>
                  <td className="table-cell"><span className={`badge ${STATUS_BADGE[c.status]}`}>{c.status}</span></td>
                  <td className="table-cell tabular-nums">{c.audience > 0 ? c.audience.toLocaleString() : "—"}</td>
                  <td className="table-cell">
                    {c.openRate > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="progress-bar w-16"><div className="progress-fill" style={{ width: `${c.openRate}%` }} /></div>
                        <span className="tabular-nums text-xs">{c.openRate}%</span>
                      </div>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="table-cell tabular-nums">{c.clickRate > 0 ? `${c.clickRate}%` : "—"}</td>
                  <td className="table-cell text-slate-500">{c.sent}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">New Campaign</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-white text-xl">✕</button>
            </div>
            {[["Campaign Name", "name", "text", "e.g. Summer Sale Launch"], ["Audience Size", "audience", "number", "e.g. 1000"]].map(([label, key, type, ph]) => (
              <div key={key}>
                <label className="text-xs text-slate-400 mb-1 block">{label}</label>
                <input className="input-field" type={type} placeholder={ph as string}
                  value={form[key as keyof typeof form]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Channel</label>
              <select className="select-field" value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}>
                <option>Email</option><option>SMS</option><option>In-app</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn-primary flex-1" onClick={createCampaign}>Create Campaign</button>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
