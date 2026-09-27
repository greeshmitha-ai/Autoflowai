"use client";

const EXTENSIONS = [
  { name: "Slack Sync", publisher: "AutoFlow", desc: "Sync notifications and alerts to Slack channels", icon: "💬", pricing: "Free", rating: "4.8" },
  { name: "HubSpot Bridge", publisher: "AutoFlow", desc: "Bi-directional contact and deal sync with HubSpot", icon: "🔗", pricing: "Paid", rating: "4.6" },
  { name: "Salesforce Connect", publisher: "AutoFlow", desc: "Enterprise CRM integration with full pipeline sync", icon: "☁️", pricing: "Paid", rating: "4.7" },
  { name: "Zapier Webhooks", publisher: "AutoFlow", desc: "Connect to 5,000+ apps via Zapier automation", icon: "⚡", pricing: "Free", rating: "4.9" },
  { name: "Google Workspace", publisher: "AutoFlow", desc: "Calendar, Gmail, and Drive integration", icon: "🔵", pricing: "Free", rating: "4.5" },
  { name: "AI Sentiment Pro", publisher: "Community", desc: "Advanced sentiment analysis for calls and chats", icon: "🧠", pricing: "Usage", rating: "4.4" },
];

export default function MarketplacePage() {
  return (
    <div className="space-y-5 max-w-7xl mx-auto page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Marketplace</h1>
          <p className="text-sm text-slate-500 mt-0.5">Extend your platform with integrations and extensions</p>
        </div>
        <button className="btn-secondary">Submit Extension</button>
      </div>

      {/* Search */}
      <div className="glass-card p-4">
        <input
          type="text"
          placeholder="Search extensions…"
          className="input-field"
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {EXTENSIONS.map((ext) => (
          <div key={ext.name} className="glass-card-hover p-5 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.06] flex items-center justify-center text-2xl flex-shrink-0">
                {ext.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-white">{ext.name}</p>
                  <span className={`badge ${ext.pricing === "Free" ? "badge-green" : ext.pricing === "Paid" ? "badge-blue" : "badge-yellow"}`}>
                    {ext.pricing}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{ext.publisher}</p>
              </div>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">{ext.desc}</p>
            <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/[0.05]">
              <span className="text-xs text-slate-500">⭐ {ext.rating}</span>
              <button className="btn-primary text-xs px-3 py-1.5">Install</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
