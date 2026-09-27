"use client";
import dynamic from "next/dynamic";
const AutomationView = dynamic(() => import("@/views/AutomationView").then(m => ({ default: m.AutomationView })), {
  loading: () => <div className="shimmer h-64 w-full" />,
  ssr: false,
});
export default function AutomationPage() {
  return (
    <div className="space-y-5 max-w-7xl mx-auto page-enter">
      <div>
        <h1 className="text-2xl font-bold text-white">Automation</h1>
        <p className="text-sm text-slate-500 mt-0.5">Build and manage AI-powered workflows</p>
      </div>
      <AutomationView />
    </div>
  );
}
