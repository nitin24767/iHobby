import { BarChart3, Boxes, Clock, PackageCheck, Plus } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { AccessPanel } from "@/components/access-panel";
import { MetricGrid } from "@/components/metric-grid";
import { SiteShell } from "@/components/site-shell";
import { Badge, Card, LinkButton } from "@/components/ui";
import { getCurrentActor } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/rbac";
import { getDashboardMetricsForActor, listOffersForActor, listSellerInventory } from "@/lib/server/marketplace";
import { getApplicationCurrency } from "@/lib/server/application-settings";

export default async function SellerDashboardPage() {
  const actor = await getCurrentActor();

  if (!can(actor.role, "seller:dashboard")) {
    return (
      <SiteShell>
        <AccessPanel title="Seller access required" />
      </SiteShell>
    );
  }

  const [inventory, currency] = await Promise.all([listSellerInventory(actor), getApplicationCurrency()]);
  const activeInventory = inventory.filter((listing) => listing.status === "ACTIVE");
  const offers = await listOffersForActor(actor);
  const metrics = await getDashboardMetricsForActor(actor);

  return (
    <SiteShell>
      <div className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge tone="accent">Seller workspace</Badge>
            <h1 className="mt-3 text-3xl font-bold">RC listings, offers, and fulfillment</h1>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">Operational view for {actor.displayName}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/sell/listings"><Boxes size={16} /> My listings</LinkButton>
            <LinkButton href="/sell/new" variant="primary"><Plus size={16} /> Create listing</LinkButton>
          </div>
        </div>

        <MetricGrid metrics={metrics} />

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card id="inventory" className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] p-4">
              <h2 className="text-lg font-bold">Active seller inventory</h2>
              <div className="flex items-center gap-2"><Badge tone="good">{activeInventory.length} active</Badge><LinkButton href="/sell/listings" size="sm" variant="ghost">View all</LinkButton></div>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {activeInventory.slice(0, 4).map((listing) => (
                <div key={listing.id} className="grid gap-3 p-4 sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-center">
                  <div className="relative aspect-square overflow-hidden rounded-md border border-[var(--line)] bg-[var(--background)]">
                    <Image
                      src={listing.media[0]?.url ?? "/media/drone-marketplace.svg"}
                      alt={listing.media[0]?.alt ?? listing.title}
                      fill
                      className="object-cover"
                      sizes="64px"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold">{listing.title}</div>
                    <div className="mt-1 text-sm text-[var(--ink-muted)]">{listing.hobbyName} / {listing.condition}</div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="font-bold">{formatMoney(listing.priceCents, currency)}</div>
                    <div className="text-xs text-[var(--ink-muted)]">{listing.stats.watchers} watchers</div>
                  </div>
                </div>
              ))}
              {activeInventory.length === 0 ? <div className="p-4 text-sm text-[var(--ink-muted)]">No active listings yet. Items awaiting review appear in My listings.</div> : null}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-lg font-bold">Action queue</h2>
            <div className="mt-4 grid gap-3">
              <QueueItem icon={<Clock size={17} />} title="Reply to offers" body={`${offers.length} offer needs a seller response.`} />
              <QueueItem icon={<PackageCheck size={17} />} title="Verify listing media" body="Add ownership proof before publishing high-value gear." />
              <QueueItem icon={<BarChart3 size={17} />} title="Pricing review" body="Two listings are outside the recommended market range." />
            </div>
          </Card>
        </section>
      </div>
    </SiteShell>
  );
}

function QueueItem({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-md bg-[var(--background)] p-3">
      <div className="grid size-8 place-items-center rounded-md bg-white text-[var(--accent)]">{icon}</div>
      <div>
        <div className="text-sm font-bold">{title}</div>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">{body}</p>
      </div>
    </div>
  );
}
