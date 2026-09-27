"use client";

import { useState, useEffect } from "react";

export interface OverviewMetrics {
  marketing: { campaignsSent: number; openRate: number };
  chatbot:   { activeConversations: number };
  calls:     { callsToday: number };
  feedback:  { npsScore: number };
}

const DEFAULT_METRICS: OverviewMetrics = {
  marketing: { campaignsSent: 34, openRate: 47.2 },
  chatbot:   { activeConversations: 18 },
  calls:     { callsToday: 26 },
  feedback:  { npsScore: 72 },
};

export function useMetricsSocket(_wsUrl: string) {
  const [metrics, setMetrics] = useState<OverviewMetrics>(DEFAULT_METRICS);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Poll the REST endpoint every 4 seconds (WS upgrade not available in Next.js App Router by default)
    async function poll() {
      try {
        const res = await fetch("/api/metrics/ws", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as Partial<OverviewMetrics>;
          setMetrics((prev) => ({
            marketing: { ...prev.marketing, ...(data.marketing ?? {}) },
            chatbot:   { ...prev.chatbot,   ...(data.chatbot   ?? {}) },
            calls:     { ...prev.calls,     ...(data.calls     ?? {}) },
            feedback:  { ...prev.feedback,  ...(data.feedback  ?? {}) },
          }));
          setConnected(true);
        }
      } catch {
        setConnected(false);
      }
    }

    void poll();
    const id = setInterval(() => void poll(), 4_000);
    return () => clearInterval(id);
  }, []);

  return { metrics, connected };
}
