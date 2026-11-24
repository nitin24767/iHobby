import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Liveness only: hosting probes should not require a login, wake a sleeping
// database, or expose details from the separate admin readiness report.
export function GET() {
  return NextResponse.json({ status: "ok" }, {
    headers: { "Cache-Control": "no-store" }
  });
}
