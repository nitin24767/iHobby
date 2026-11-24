import { CheckCircle2, ExternalLink, RotateCcw, Tag, XCircle } from "lucide-react";
import {
  acceptOfferAction,
  declineOfferAction,
  withdrawOfferAction
} from "@/app/offers/actions";
import { AccessPanel } from "@/components/access-panel";
import { SiteShell } from "@/components/site-shell";
import { Badge, Button, Card, LinkButton } from "@/components/ui";
import { getCurrentActor } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/rbac";
import { listOffersForActor } from "@/lib/server/marketplace";
import { getApplicationCurrency } from "@/lib/server/application-settings";
import type { Offer, OfferStatus, Role } from "@/types/domain";

export default async function OffersPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const actor = await getCurrentActor();
  const { status } = await searchParams;

  if (!can(actor.role, "offer:create")) {
    return (
      <SiteShell>
        <AccessPanel title="Member access required" />
      </SiteShell>
    );
  }

  const [offers, currency] = await Promise.all([listOffersForActor(actor), getApplicationCurrency()]);
  const pendingCount = offers.filter((offer) => offer.status === "PENDING").length;

  return (
    <SiteShell>
      <div className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge tone="accent">Offer management</Badge>
            <div className="mt-3 flex items-center gap-2">
              <Tag className="text-[var(--teal)]" size={28} />
              <h1 className="text-3xl font-bold">Offers</h1>
            </div>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              {offers.length} total offer{offers.length === 1 ? "" : "s"} / {pendingCount} pending
            </p>
          </div>
        </div>

        {status ? <StatusMessage status={status} /> : null}

        <Card className="overflow-hidden">
          <div className="divide-y divide-[var(--line)]">
            {offers.map((offer) => (
              <OfferRow key={offer.id} offer={offer} role={actor.role} currency={currency} />
            ))}
            {offers.length === 0 ? (
              <div className="p-4 text-sm text-[var(--ink-muted)]">No offers yet.</div>
            ) : null}
          </div>
        </Card>
      </div>
    </SiteShell>
  );
}

function OfferRow({ offer, role, currency }: { offer: Offer; role: Role; currency: string }) {
  const listingTitle = offer.listingTitle ?? "Listing";
  const participant =
    role === "SELLER"
      ? `From ${offer.buyerName ?? "buyer"}`
      : role === "BUYER"
        ? `Seller ${offer.sellerName ?? "seller"}`
        : `${offer.buyerName ?? "Buyer"} / ${offer.sellerName ?? "seller"}`;
  const canSellerAct = (role === "SELLER" || role === "ADMIN") && offer.status === "PENDING";
  const canBuyerWithdraw = role === "BUYER" && offer.status === "PENDING";

  return (
    <article className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-bold">{listingTitle}</h2>
          <StatusBadge status={offer.status} />
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--ink-muted)]">
          <span>{participant}</span>
          <span>Submitted {new Date(offer.createdAt).toLocaleDateString("en-US")}</span>
        </div>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">{offer.message ?? "No message."}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <span className="mono text-base font-bold">{formatMoney(offer.amountCents, currency)}</span>
        {offer.listingSlug ? (
          <LinkButton href={`/listings/${offer.listingSlug}`} size="sm" variant="ghost">
            <ExternalLink size={13} /> Open
          </LinkButton>
        ) : null}
        {canSellerAct ? (
          <>
            <form action={acceptOfferAction}>
              <input type="hidden" name="offerId" value={offer.id} />
              <Button size="sm" type="submit">
                <CheckCircle2 size={15} /> Accept
              </Button>
            </form>
            <form action={declineOfferAction}>
              <input type="hidden" name="offerId" value={offer.id} />
              <Button size="sm" type="submit" variant="danger">
                <XCircle size={15} /> Decline
              </Button>
            </form>
          </>
        ) : null}
        {canBuyerWithdraw ? (
          <form action={withdrawOfferAction}>
            <input type="hidden" name="offerId" value={offer.id} />
            <Button size="sm" type="submit" variant="danger">
              <RotateCcw size={15} /> Withdraw
            </Button>
          </form>
        ) : null}
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: OfferStatus }) {
  const toneMap: Record<OfferStatus, "neutral" | "accent" | "good" | "warn" | "bad" | "info"> = {
    PENDING: "warn",
    ACCEPTED: "good",
    DECLINED: "bad",
    EXPIRED: "neutral",
    WITHDRAWN: "info"
  };

  return <Badge tone={toneMap[status]}>{status.toLowerCase()}</Badge>;
}

function StatusMessage({ status }: { status: string }) {
  const copy: Record<string, string> = {
    accepted: "Offer accepted. The listing is marked sold.",
    declined: "Offer declined.",
    withdrawn: "Offer withdrawn.",
    forbidden: "This account cannot manage that offer.",
    missing: "Offer could not be found.",
    rejected: "Offer is no longer pending.",
    invalid: "Invalid offer action.",
    error: "Offer update failed."
  };
  const positive = status === "accepted" || status === "declined" || status === "withdrawn";
  const tone = positive ? "border-green-200 bg-green-50 text-green-800" : "border-[var(--accent)] bg-orange-50 text-[var(--accent-strong)]";

  return (
    <div className={`rounded-lg border p-4 text-sm font-semibold ${tone}`}>
      {copy[status] ?? "Action completed."}
    </div>
  );
}
