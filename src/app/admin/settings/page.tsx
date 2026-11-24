import { CircleDollarSign } from "lucide-react";
import { updateCurrencyAction } from "@/app/admin/settings/actions";
import { AccessPanel } from "@/components/access-panel";
import { SiteShell } from "@/components/site-shell";
import { Badge, Button, Card, Field } from "@/components/ui";
import { getCurrentActor } from "@/lib/auth";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { can } from "@/lib/rbac";
import { getApplicationCurrency } from "@/lib/server/application-settings";

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const actor = await getCurrentActor();
  const { status } = await searchParams;
  if (!can(actor.role, "admin:manage-settings")) {
    return <SiteShell><AccessPanel title="Admin settings access required" /></SiteShell>;
  }

  const currency = await getApplicationCurrency();
  return (
    <SiteShell>
      <div className="grid gap-5">
        <div>
          <Badge tone="bad">Application settings</Badge>
          <h1 className="mt-3 text-3xl font-bold">Currency</h1>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">Set the single currency used throughout iHobby.</p>
        </div>
        {status ? <StatusMessage status={status} /> : null}
        <Card className="max-w-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--surface-muted)] text-[var(--teal)]"><CircleDollarSign size={21} /></div>
            <div>
              <h2 className="font-bold">Application-wide currency</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--ink-muted)]">
                This changes the denomination shown across listings, bids, offers, pricing, and build costs. Existing numeric amounts are not exchange-rate converted.
              </p>
            </div>
          </div>
          <form action={updateCurrencyAction} className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Currency" hint="Only currencies with two-decimal minor units are supported.">
              <select name="currency" defaultValue={currency} className="focus-ring h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm">
                {SUPPORTED_CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.name}</option>)}
              </select>
            </Field>
            <Button type="submit" variant="primary">Save currency</Button>
          </form>
        </Card>
      </div>
    </SiteShell>
  );
}

function StatusMessage({ status }: { status: string }) {
  const copy: Record<string, string> = {
    updated: "Application currency updated successfully.",
    invalid: "Choose a supported currency.",
    forbidden: "Administrator settings access is required.",
    error: "Currency could not be updated. Apply the latest database migration and try again."
  };
  const good = status === "updated";
  return <Card className={`max-w-2xl p-4 text-sm font-semibold ${good ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-[var(--red)]"}`}>{copy[status] ?? "Settings updated."}</Card>;
}
