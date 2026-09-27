"use client";
import dynamic from "next/dynamic";
const MarketingView = dynamic(() => import("@/views/MarketingView").then(m => ({ default: m.MarketingView })), {
  loading: () => <div className="shimmer h-64 w-full" />,
  ssr: false,
});
export default function MarketingPage() {
  return (
    <div className="space-y-5 max-w-7xl mx-auto page-enter">
      <div>
        <h1 className="text-2xl font-bold text-white">Marketing</h1>
        <p className="text-sm text-slate-500 mt-0.5">Campaigns, templates, and audience management</p>
      </div>
      <MarketingView />
    </div>
  );
}
