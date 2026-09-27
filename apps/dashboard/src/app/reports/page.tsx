"use client";
import { ReportsView } from "@/views/ReportsView";

export default function ReportsPage() {
  return (
    <div className="space-y-5 max-w-7xl mx-auto page-enter">
      <div>
        <h1 className="text-2xl font-bold text-white">Reports</h1>
        <p className="text-sm text-slate-500 mt-0.5">Build custom reports and schedule delivery</p>
      </div>
      <ReportsView />
    </div>
  );
}
