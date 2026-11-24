import { Gavel } from "lucide-react";
import { AccessPanel } from "@/components/access-panel";
import { SiteShell } from "@/components/site-shell";
import { Badge, Card, LinkButton } from "@/components/ui";
import { getCurrentActor } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/rbac";
import { listBidsForActor, listMarketplaceListings } from "@/lib/server/marketplace";
import { getApplicationCurrency } from "@/lib/server/application-settings";

export default async function BidsPage() {
  const actor = await getCurrentActor();

  if (!can(actor.role, "bid:create")) {
    return (
      <SiteShell>
        <AccessPanel title="Buyer access required" />
      </SiteShell>
    );
  }

  const [bids, listings, currency] = await Promise.all([
    listBidsForActor(actor),
    listMarketplaceListings(),
    getApplicationCurrency()
  ]);

  return (
    <SiteShell>
      <div className="grid gap-5">
        <div className="flex items-center gap-2">
          <Gavel className="text-[var(--accent)]" size={28} />
          <h1 className="text-3xl font-bold">Bids</h1>
        </div>
        <Card className="overflow-hidden">
          <div className="divide-y divide-[var(--line)]">
            {bids.map((bid) => {
              const listing = listings.find((item) => item.id === bid.listingId);
              return (
                <div key={bid.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <div>
                    <div className="font-bold">{listing?.title}</div>
                    <div className="mt-1 text-sm text-[var(--ink-muted)]">{bid.createdAt}</div>
                  </div>
                  <Badge tone={bid.status === "WINNING" ? "good" : "neutral"}>{bid.status.toLowerCase()}</Badge>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">{formatMoney(bid.amountCents, currency)}</span>
                    {listing ? <LinkButton href={`/listings/${listing.slug}`} size="sm">Open</LinkButton> : null}
                  </div>
                </div>
              );
            })}
            {bids.length === 0 ? (
              <div className="p-4 text-sm text-[var(--ink-muted)]">No bids yet.</div>
            ) : null}
          </div>
        </Card>
      </div>
    </SiteShell>
  );
}
