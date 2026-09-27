"use client";

const SETTINGS_SECTIONS = [
  {
    title: "Account",
    items: [
      { label: "Profile", desc: "Update your name, email, and avatar", icon: "👤" },
      { label: "Password & Security", desc: "Change password and enable 2FA", icon: "🔒" },
      { label: "Notifications", desc: "Configure email, push, and in-app alerts", icon: "🔔" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { label: "General", desc: "Workspace name, timezone, and language", icon: "⚙" },
      { label: "Team Members", desc: "Invite and manage team roles", icon: "👥" },
      { label: "Billing", desc: "Subscription, usage, and invoices", icon: "💳" },
    ],
  },
  {
    title: "Integrations",
    items: [
      { label: "API Keys", desc: "Create and manage API access tokens", icon: "🔑" },
      { label: "Webhooks", desc: "Configure outbound webhook endpoints", icon: "🔗" },
      { label: "SSO", desc: "Set up SAML or OAuth single sign-on", icon: "🛡" },
    ],
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-3xl mx-auto page-enter">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your account and workspace preferences</p>
      </div>

      {SETTINGS_SECTIONS.map((section) => (
        <div key={section.title} className="glass-card overflow-hidden">
          <div className="px-5 py-3 border-b border-white/[0.06]">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">{section.title}</p>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {section.items.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-4 px-5 py-4 hover:bg-white/[0.03] cursor-pointer transition-colors group"
              >
                <div className="w-10 h-10 rounded-xl bg-white/[0.05] flex items-center justify-center text-lg flex-shrink-0">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{item.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                </div>
                <span className="text-slate-600 group-hover:text-slate-400 transition-colors">›</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
