import { Boxes, CheckCircle2, Wrench } from "lucide-react";
import { AccessPanel } from "@/components/access-panel";
import { SiteShell } from "@/components/site-shell";
import { Badge, Button, Card, Field, Input, Textarea } from "@/components/ui";
import { saveBuildWorkshopAction } from "@/app/tools/build/actions";
import { getCurrentActor } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/rbac";
import { getBuildWorkshopForActor } from "@/lib/server/marketplace";
import { getApplicationCurrency } from "@/lib/server/application-settings";

export default async function BuildPlannerPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await getCurrentActor();
  const { status } = await searchParams;

  if (!can(actor.role, "ai:use")) {
    return (
      <SiteShell>
        <AccessPanel title="Member access required" />
      </SiteShell>
    );
  }

  const [build, currency] = await Promise.all([getBuildWorkshopForActor(actor), getApplicationCurrency()]);
  const toolbarParts = build.parts.slice(0, 4);

  return (
    <SiteShell>
      <div className="page-head">
        <div>
          <Badge tone="info">Workshop</Badge>
          <h1 className="page-title mt-3">Build & Configure</h1>
          <div className="page-sub">Specification-based RC build checks for weight, cost, thrust, and electrical fit.</div>
        </div>
      </div>

      {status ? <BuildStatus status={status} /> : null}

      <Card className="mb-5 p-4">
        <form action={saveBuildWorkshopAction} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Build name"><Input name="title" defaultValue={build.title === "No saved build" ? "" : build.title} required /></Field>
          <Field label="Vehicle family">
            <select name="vehicleType" defaultValue={build.vehicleType === "none" ? "drones" : build.vehicleType} className="focus-ring h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm">
              <option value="drones">Drones</option><option value="helis">Helicopters</option><option value="planes">Planes</option><option value="cars">Cars</option>
            </select>
          </Field>
          <Field label="Dry weight (g)"><Input name="dryWeightGrams" type="number" min="0" defaultValue={build.dryWeightGrams || ""} required /></Field>
          <Field label={`Estimated cost (${currency})`}><Input name="estimatedCost" inputMode="decimal" defaultValue={build.estimatedCostCents ? (build.estimatedCostCents / 100).toFixed(2) : ""} required /></Field>
          <Field label="Thrust ratio"><Input name="thrustRatio" defaultValue={build.thrustRatio === "-" ? "" : build.thrustRatio} placeholder="e.g. 6.2:1" required /></Field>
          <Field label="Build note"><Input name="note" defaultValue={build.note.startsWith("No saved") ? "" : build.note} /></Field>
          <div className="md:col-span-2 xl:col-span-3"><Field label="Parts and ratings (one per line: Slot: specification)"><Textarea name="parts" defaultValue={build.parts.map((part) => `${part.slot}: ${part.selected}`).join("\n")} placeholder={"Frame: 5 inch carbon frame\nMotor set: 2207 1750KV 35A\nESC: 45A 3-6S\nBattery: 6S 1300mAh"} /></Field></div>
          <div className="flex justify-end md:col-span-2 xl:col-span-3"><Button variant="primary"><Wrench size={16} /> Save build & run check</Button></div>
        </form>
      </Card>

      <div className="build-shell">
        <aside className="build-parts">
          <div className="border-b border-[var(--line)] p-4">
            <h2 className="text-sm font-bold">Parts bin</h2>
            <div className="mt-1 text-xs text-[var(--ink-muted)]">Saved components and the supplied specifications.</div>
          </div>
          {build.parts.length ? (
            build.parts.map((part) => (
              <div key={part.slot} className={part.active ? "part-row selected" : "part-row"}>
                <div className="part-icon">
                  <Boxes size={16} />
                </div>
                <div>
                  <div className="font-semibold">{part.slot}</div>
                  <div className="text-xs text-[var(--ink-muted)]">{part.selected}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 text-sm text-[var(--ink-muted)]">No parts have been added to this build yet.</div>
          )}
        </aside>

        <section className="build-stage">
          <div className="build-toolbar">
            {toolbarParts.length ? (
              toolbarParts.map((part) => (
                <span key={part.slot} className="btn-control h-8 px-3 text-xs">{part.slot}</span>
              ))
            ) : (
              <span className="btn-control h-8 px-3 text-xs">No parts</span>
            )}
          </div>
          <div className="build-canvas">
            <div className="grid size-64 place-items-center rounded-full border border-dashed border-[var(--line-2)] bg-white/70">
              <div className="grid gap-3 text-center">
                <div className="mx-auto grid size-20 place-items-center rounded-md bg-[var(--ink)] text-white">
                  <Wrench size={34} />
                </div>
                <div className="font-bold">{build.title}</div>
                <div className="text-xs text-[var(--ink-muted)]">
                  {build.parts.length ? build.parts.map((part) => part.slot).join(", ") : "No parts selected"}
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="build-summary p-4">
          <h2 className="text-lg font-bold">Summary</h2>
          <div className="mt-4 sim-readout">
            <Readout label="Dry weight" value={`${build.dryWeightGrams} g`} />
            <Readout label="Cost" value={formatMoney(build.estimatedCostCents, currency)} />
            <Readout label="Thrust" value={build.thrustRatio} />
            <Readout label="Risk" value={build.riskLevel} />
          </div>
          <div className="mt-4 grid gap-3">
            {build.parts.length ? (
              build.parts.map((part) => (
                <div key={part.slot} className="flex items-center justify-between gap-3 rounded-md border border-[var(--line)] p-3 text-sm">
                  <span>{part.slot}</span>
                  <Badge tone={compatibilityTone(part.status)}>{part.status}</Badge>
                </div>
              ))
            ) : (
              <div className="rounded-md border border-[var(--line)] p-3 text-sm text-[var(--ink-muted)]">No compatibility checks are available.</div>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-[var(--ink-muted)]">
            <CheckCircle2 size={16} /> {build.note}
          </div>
        </aside>
      </div>
    </SiteShell>
  );
}

function BuildStatus({ status }: { status: string }) {
  const copy: Record<string, string> = {
    saved: "Build saved and specification checks refreshed.",
    invalid: "Enter a build name, valid measurements, thrust ratio, and any selected parts.",
    forbidden: "You do not have permission to save builds.",
    error: "The build could not be saved. Please try again."
  };
  return <Card className="mb-5 border-[var(--accent)] bg-orange-50 p-4 text-sm font-semibold text-[var(--accent-strong)]">{copy[status] ?? "Build status updated."}</Card>;
}

function compatibilityTone(status: string): "good" | "warn" | "bad" | "neutral" {
  if (status.startsWith("Compatible")) return "good";
  if (status.startsWith("Incompatible")) return "bad";
  if (status.startsWith("Review")) return "warn";
  return "neutral";
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="section-title mono upper">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}
