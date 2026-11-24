import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getReadinessReport } from "@/lib/server/readiness";

export async function GET() {
  const actor = await getCurrentActor();

  if (!can(actor.role, "admin:dashboard")) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const report = await getReadinessReport();
  const ready = report.deploymentMode === "demo" ? report.readyForDemo : report.readyForNonPaymentLaunch;
  return NextResponse.json(report, { status: ready ? 200 : 503 });
}
