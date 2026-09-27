"use client";

import { DegradedServiceBanner } from "@/components/DegradedServiceBanner";
import { useServiceHealth } from "@/hooks/useServiceHealth";

interface SubsystemPageProps {
  title: string;
  serviceKey: string;
  children: React.ReactNode;
}

export function SubsystemPage({ title, serviceKey, children }: SubsystemPageProps) {
  const health = useServiceHealth(serviceKey);

  return (
    <div className="space-y-5 max-w-7xl mx-auto page-enter">
      {health === "degraded" && <DegradedServiceBanner serviceName={title} />}
      {children}
    </div>
  );
}
