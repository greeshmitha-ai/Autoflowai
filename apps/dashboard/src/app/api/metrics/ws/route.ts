import { NextResponse } from "next/server";

// Since Next.js App Router doesn't natively support WebSocket upgrades,
// we use polling via this REST endpoint instead.
// The useMetricsSocket hook will be updated to support polling fallback.

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function GET() {
  const metrics = {
    marketing: {
      campaignsSent: randomBetween(28, 45),
      openRate: parseFloat((Math.random() * 20 + 35).toFixed(1)),
    },
    chatbot: {
      activeConversations: randomBetween(10, 32),
    },
    calls: {
      callsToday: randomBetween(18, 40),
    },
    feedback: {
      npsScore: randomBetween(62, 84),
    },
  };

  return NextResponse.json(metrics, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
