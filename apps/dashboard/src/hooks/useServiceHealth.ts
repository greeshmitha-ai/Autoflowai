"use client";

import { useState, useEffect } from "react";

export type HealthStatus = "healthy" | "degraded" | "unknown";

const SERVICE_HEALTH_ENDPOINTS: Record<string, string> = {
  marketing: "/api/health/marketing",
  chatbot: "/api/health/chatbot",
  calls: "/api/health/calls",
  feedback: "/api/health/feedback",
  contacts: "/api/health/contacts",
  crm: "/api/health/crm",
  automation: "/api/health/automation",
};

export function useServiceHealth(service: string): HealthStatus {
  const [status, setStatus] = useState<HealthStatus>("unknown");

  useEffect(() => {
    const endpoint = SERVICE_HEALTH_ENDPOINTS[service];
    if (!endpoint) return;

    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(endpoint, { method: "GET" });
        if (!cancelled) {
          setStatus(res.ok ? "healthy" : "degraded");
        }
      } catch {
        if (!cancelled) {
          setStatus("degraded");
        }
      }
    }

    void check();
    const interval = setInterval(() => void check(), 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [service]);

  return status;
}
