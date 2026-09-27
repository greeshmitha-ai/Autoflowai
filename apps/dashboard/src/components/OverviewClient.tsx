"use client";

import { useMetricsSocket } from "@/hooks/useMetricsSocket";
import { useEffect, useState } from "react";
import Link from "next/link";

const WS_URL =
  typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/api/metrics/ws`
    : "ws://localhost:3000/api/metrics/ws";

const QUICK_ACTIONS = [
  { label: "New Contact",  icon: "👤", color: "from-blue-500/20 to-blue-600/10 border-blue-500/20",   href: "/contacts",   glow: "hover:shadow-blue-500/10" },
  { label: "New Campaign", icon: "📣", color: "from-purple-500/20 to-purple-600/10 border-purple-500/20", href: "/marketing",  glow: "hover:shadow-purple-500/10" },
  { label: "Start Call",   icon: "📞", color: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/20", href: "/calls",      glow: "hover:shadow-emerald-500/10" },
  { label: "New Workflow", icon: "⚡", color: "from-amber-500/20 to-amber-600/10 border-amber-500/20",  href: "/automation", glow: "hover:shadow-amber-500/10" },
];

const RECENT_ACTIVITY = [
  { type: "contact",  text: "New contact Alice Johnson added",               time: "2m ago",  icon: "👤", color: "bg-blue-500/15 text-blue-400" },
  { type: "campaign", text: "Campaign 'Q2 Launch' sent to 1,240 contacts",   time: "15m ago", icon: "📣", color: "bg-purple-500/15 text-purple-400" },
  { type: "call",     text: "Outbound call completed — 4m 32s",              time: "1h ago",  icon: "📞", color: "bg-emerald-500/15 text-emerald-400" },
  { type: "deal",     text: "Deal 'Enterprise Plan' moved to Proposal",      time: "2h ago",  icon: "💼", color: "bg-amber-500/15 text-amber-400" },
  { type: "survey",   text: "NPS survey response received — Score: 9",       time: "3h ago",  icon: "⭐", color: "bg-yellow-500/15 text-yellow-400" },
];

const AI_INSIGHTS = [
  "📈 Your open rate jumped 12% — consider following up with the engaged segment.",
  "🤖 3 automation workflows are ready to activate — they'll save ~4 hrs/week.",
  "🎯 Lead score distribution improved: 28% more contacts crossed the 70+ threshold.",
];

// Tiny inline sparkline SVG
function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 80, h = 28;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <polyline points={pts} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Animated number counter
function AnimatedNumber({ value, suffix = "" }: { value: number | string; suffix?: string }) {
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    const num = typeof value === "string" ? parseFloat(value.replace(/[^0-9.]/g, "")) : value;
    if (isNaN(num)) { setDisplay(String(value)); return; }
    let start = 0;
    const duration = 800;
    const step = 16;
    const steps = duration / step;
    const increment = num / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= num) { current = num; clearInterval(timer); }
      setDisplay(
        Number.isInteger(num)
          ? Math.round(current).toLocaleString() + suffix
          : current.toFixed(1) + suffix
      );
    }, step);
    return () => clearInterval(timer);
  }, [value, suffix]);

  return <span className="tabular-nums">{display}</span>;
}

export function OverviewClient() {
  const { metrics, connected } = useMetricsSocket(WS_URL);
  const [insightIdx] = useState(() => Math.floor(Math.random() * AI_INSIGHTS.length));
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const metricCards = [
    {
      label: "Campaigns Sent", value: metrics.marketing.campaignsSent, suffix: "",
      change: "+12%", up: true, icon: "📣",
      color: "from-purple-500/10 to-purple-600/5", border: "border-purple-500/15",
      iconBg: "bg-purple-500/15 text-purple-400", sparkColor: "#a78bfa",
      sparkData: [18, 22, 19, 28, 24, 31, metrics.marketing.campaignsSent || 35],
      sub: "Last 30 days",
    },
    {
      label: "Open Rate", value: metrics.marketing.openRate, suffix: "%",
      change: "+3.2%", up: true, icon: "📬",
      color: "from-blue-500/10 to-blue-600/5", border: "border-blue-500/15",
      iconBg: "bg-blue-500/15 text-blue-400", sparkColor: "#60a5fa",
      sparkData: [38, 41, 39, 44, 42, 47, metrics.marketing.openRate || 48],
      sub: "Email campaigns",
    },
    {
      label: "Active Chats", value: metrics.chatbot.activeConversations, suffix: "",
      change: "+5", up: true, icon: "💬",
      color: "from-emerald-500/10 to-emerald-600/5", border: "border-emerald-500/15",
      iconBg: "bg-emerald-500/15 text-emerald-400", sparkColor: "#34d399",
      sparkData: [8, 12, 10, 15, 14, 17, metrics.chatbot.activeConversations || 18],
      sub: "Live right now",
    },
    {
      label: "Calls Today", value: metrics.calls.callsToday, suffix: "",
      change: "-2", up: false, icon: "📞",
      color: "from-amber-500/10 to-amber-600/5", border: "border-amber-500/15",
      iconBg: "bg-amber-500/15 text-amber-400", sparkColor: "#fbbf24",
      sparkData: [24, 28, 22, 26, 21, 25, metrics.calls.callsToday || 23],
      sub: "Inbound + outbound",
    },
    {
      label: "NPS Score", value: metrics.feedback.npsScore, suffix: "",
      change: "+4", up: true, icon: "⭐",
      color: "from-yellow-500/10 to-yellow-600/5", border: "border-yellow-500/15",
      iconBg: "bg-yellow-500/15 text-yellow-400", sparkColor: "#facc15",
      sparkData: [56, 58, 61, 59, 63, 67, metrics.feedback.npsScore || 72],
      sub: "Net Promoter Score",
    },
    {
      label: "Open Deals", value: 24, suffix: "",
      change: "+3", up: true, icon: "💼",
      color: "from-indigo-500/10 to-indigo-600/5", border: "border-indigo-500/15",
      iconBg: "bg-indigo-500/15 text-indigo-400", sparkColor: "#818cf8",
      sparkData: [18, 20, 19, 22, 21, 23, 24],
      sub: "Pipeline $142k",
    },
  ];

  if (!mounted) return null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between slide-up stagger-1">
        <div>
          <h1 className="text-2xl font-bold text-white">{greeting}, Nikhil 👋</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-300 ${
              connected
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-slate-500/10 text-slate-400 border-slate-500/20"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400 pulse-dot" : "bg-slate-400"}`} />
            {connected ? "Live" : "Connecting…"}
          </span>
        </div>
      </div>

      {/* AI Insight Banner */}
      <div className="slide-up stagger-2 glass-card p-4 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border-indigo-500/20 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center text-base shrink-0">🧠</div>
        <p className="text-sm text-slate-300 flex-1">{AI_INSIGHTS[insightIdx]}</p>
        <button className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors shrink-0">Dismiss</button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        {metricCards.map((card, i) => (
          <div
            key={card.label}
            className={`glass-card-hover p-4 bg-gradient-to-br ${card.color} ${card.border} cursor-pointer slide-up stagger-${Math.min(i + 1, 6)}`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${card.iconBg}`}>
                {card.icon}
              </div>
              <span className={card.up ? "stat-change-up" : "stat-change-down"}>
                {card.up ? "↑" : "↓"} {card.change}
              </span>
            </div>
            <p className="stat-value text-xl">
              <AnimatedNumber value={card.value} suffix={card.suffix} />
            </p>
            <p className="text-xs text-slate-400 mt-1 font-medium">{card.label}</p>
            <div className="mt-2 opacity-60">
              <Sparkline values={card.sparkData} color={card.sparkColor} />
            </div>
            <p className="stat-label mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Quick actions + Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 slide-up stagger-4">
        {/* Quick actions */}
        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border bg-gradient-to-br ${action.color} hover:scale-[1.03] hover:shadow-lg ${action.glow} transition-all duration-200 cursor-pointer`}
              >
                <span className="text-2xl">{action.icon}</span>
                <span className="text-xs font-medium text-slate-300 text-center">{action.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="glass-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">Recent Activity</h2>
            <button className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">View all</button>
          </div>
          <div className="space-y-1">
            {RECENT_ACTIVITY.map((item, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 py-2.5 border-b border-white/[0.04] last:border-0 slide-right stagger-${i + 1}`}
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0 ${item.color}`}>
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-300 leading-snug">{item.text}</p>
                  <p className="text-xs text-slate-600 mt-0.5">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Service health */}
      <div className="glass-card p-5 slide-up stagger-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Service Health</h2>
          <span className="badge badge-green">All systems operational</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {["Auth","Contacts","Marketing","Chatbot","Calls","Feedback","CRM","Automation"].map((svc) => (
            <div key={svc} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.05] transition-colors cursor-default">
              <div className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot" />
              <span className="text-[10px] text-slate-400 font-medium text-center">{svc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
