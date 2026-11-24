import { Heart } from "lucide-react";
import { AccessPanel } from "@/components/access-panel";
import { ListingCard } from "@/components/listing-card";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui";
import { getCurrentActor } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listWatchlistListings } from "@/lib/server/marketplace";
import { getApplicationCurrency } from "@/lib/server/application-settings";

export default async function WatchlistPage() {
  const actor = await getCurrentActor();

  if (!can(actor.role, "watchlist:update")) {
    return (
      <SiteShell>
        <AccessPanel title="Member access required" />
      </SiteShell>
    );
  }

  const [listings, currency] = await Promise.all([listWatchlistListings(actor), getApplicationCurrency()]);

  return (
    <SiteShell>
      <div className="grid gap-5">
        <div className="flex items-center gap-2">
          <Heart className="text-[var(--accent)]" size={28} />
          <div>
            <h1 className="text-3xl font-bold">Watchlist</h1>
            <Badge className="mt-2">{listings.length} saved listings</Badge>
          </div>
        </div>
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} currency={currency} />
          ))}
        </section>
      </div>
    </SiteShell>
  );
}
