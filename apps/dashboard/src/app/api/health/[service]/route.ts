import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Simple health check endpoint for all services
export function GET(_req: NextRequest) {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
