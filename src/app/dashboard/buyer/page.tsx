import { Gavel, Heart, MessageSquare, Search } from "lucide-react";
import type { ReactNode } from "react";
import { ListingCard } from "@/components/listing-card";
import { MetricGrid } from "@/components/metric-grid";
import { SiteShell } from "@/components/site-shell";
import { Badge, Card, LinkButton } from "@/components/ui";
import { getCurrentActor } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { AccessPanel } from "@/components/access-panel";
import { getDashboardMetricsForActor, listMarketplaceListings, listWatchlistListings } from "@/lib/server/marketplace";
import { getApplicationCurrency } from "@/lib/server/application-settings";

export default async function BuyerDashboardPage() {
  const actor = await getCurrentActor();

  if (!can(actor.role, "buyer:dashboard")) {
    return (
      <SiteShell>
        <AccessPanel title="Buyer access required" />
      </SiteShell>
    );
  }

  const [saved, currency] = await Promise.all([listWatchlistListings(actor), getApplicationCurrency()]);
  const watched = saved.length ? saved.slice(0, 3) : (await listMarketplaceListings()).slice(0, 3);
  const metrics = await getDashboardMetricsForActor(actor);

  return (
    <SiteShell>
      <div className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge tone="info">Buyer workspace</Badge>
            <h1 className="mt-3 text-3xl font-bold">RC deals, bids, and saved searches</h1>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">Signed in as {actor.displayName}</p>
          </div>
          <LinkButton href="/" variant="primary"><Search size={16} /> Browse listings</LinkButton>
        </div>

        <MetricGrid metrics={metrics} />

        <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {watched.map((listing) => (
              <ListingCard key={listing.id} listing={listing} currency={currency} />
            ))}
          </div>
          <Card className="p-5">
            <h2 className="text-lg font-bold">Activity queue</h2>
              <div className="mt-4 grid gap-3">
              <Activity icon={<Gavel size={17} />} title="Auction needs review" body="Autel EVO Lite+ has a higher recommended bid range." />
              <Activity icon={<Heart size={17} />} title="Watchlist match" body="Three new drone component listings match your saved filters." />
              <Activity icon={<MessageSquare size={17} />} title="Seller reply" body="Skywright Kit Co. confirmed the charger and spare props." />
            </div>
          </Card>
        </section>
      </div>
    </SiteShell>
  );
}

function Activity({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-md border border-[var(--line)] p-3">
      <div className="grid size-8 place-items-center rounded-md bg-[var(--surface-muted)] text-[var(--teal)]">{icon}</div>
      <div>
        <div className="text-sm font-bold">{title}</div>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">{body}</p>
      </div>
    </div>
  );
}
