import { Clock, Gavel, Heart, MapPin, MessageSquare, ShieldCheck, Star, Tag } from "lucide-react";
import { notFound } from "next/navigation";
import {
  makeOfferAction,
  messageSellerAction,
  placeBidAction,
  submitSellerReviewAction,
  watchListingAction
} from "@/app/listings/[slug]/actions";
import { ListingMediaGallery } from "@/components/listing-media-gallery";
import { ListingCountdown } from "@/components/listing-countdown";
import { SiteShell } from "@/components/site-shell";
import { Badge, Button, Card, Field, Input, Textarea } from "@/components/ui";
import { getCurrentActor } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { getListingDetailBySlug, getSellerReviewEligibilityForActor, listBidsForListing } from "@/lib/server/marketplace";
import { getApplicationCurrency } from "@/lib/server/application-settings";
import { canPlaceBid, minimumNextBid } from "@/lib/transactions";

export default async function ListingDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { slug } = await params;
  const { status } = await searchParams;
  const listing = await getListingDetailBySlug(slug);
  if (!listing) notFound();

  const actor = await getCurrentActor();
  const nextBid = minimumNextBid(listing.priceCents);
  const bidDecision = canPlaceBid(listing, actor.id, nextBid);
  const [listingBids, reviewEligibility, currency] = await Promise.all([
    listBidsForListing(listing.id),
    getSellerReviewEligibilityForActor(actor, listing.id),
    getApplicationCurrency()
  ]);
  const fallbackMedia = { url: "/media/drone-marketplace.svg", alt: listing.title };
  const media = listing.media.length ? listing.media : [fallbackMedia];
  const specs = [
    ["Category", listing.categoryName],
    ["Condition", listing.condition],
    ["Listing ID", listing.id],
    ["Location", listing.location],
    ...Object.entries(listing.attributes).map(([key, value]) => [labelize(key), String(value)])
  ];

  return (
    <SiteShell>
      {status ? <StatusMessage status={status} /> : null}
      <div className="detail-grid">
        <section className="min-w-0">
          <ListingMediaGallery media={media} title={listing.title} />

          <Card className="mt-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">{listing.hobbyName}</Badge>
              <Badge>{listing.categoryName}</Badge>
              <Badge tone="good">
                <ShieldCheck size={13} /> Approved seller
              </Badge>
            </div>
            <h1 className="mt-3 text-[26px] font-bold leading-tight">{listing.title}</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--ink-muted)]">{listing.description}</p>

            <h2 className="section-title mono upper mt-5">Specifications</h2>
            <dl className="specs">
              {specs.map(([label, value]) => (
                <div key={label} className="spec">
                  <dt className="spec-label mono upper">{label}</dt>
                  <dd className="spec-val">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>

        <aside>
          <div className="bid-box">
            <div className="bid-stat">
              <div className="text-sm text-[var(--ink-muted)]">{listing.listingType === "AUCTION" ? "Current bid" : "Price"}</div>
              <Badge tone={listing.listingType === "AUCTION" ? "bad" : "info"}>{listing.listingType.replace("_", " ")}</Badge>
            </div>
            <div className="bid-amount mono">{formatMoney(listing.priceCents, currency)}</div>
            <div className="mt-3 grid gap-2 text-sm text-[var(--ink-muted)]">
              <span className="flex items-center gap-2">
                <MapPin size={16} /> {listing.location}
              </span>
              <span className="flex items-center gap-2">
                <Clock size={16} /> {listing.listingType === "AUCTION" && listing.endsAt ? `Ends ${new Date(listing.endsAt).toLocaleDateString("en-US")}` : listing.listingType === "AUCTION" ? "Auction end unavailable" : "Open listing"}
              </span>
              <span className="flex items-center gap-2">
                <Tag size={16} /> {listing.stats.offers} offers
              </span>
            </div>

            {listing.listingType === "AUCTION" && listing.endsAt ? <ListingCountdown endsAt={listing.endsAt} /> : null}

            <form action={placeBidAction} className="bid-input">
              <input type="hidden" name="listingId" value={listing.id} />
              <input type="hidden" name="slug" value={listing.slug} />
              <Input name="amount" className="mono flex-1" defaultValue={String(Math.round(nextBid / 100))} aria-label="Bid amount" />
              <Button variant="primary" disabled={!bidDecision.ok && listing.listingType === "AUCTION"}>
                <Gavel size={16} /> Bid
              </Button>
            </form>
            {!bidDecision.ok && listing.listingType === "AUCTION" ? (
              <p className="mt-3 text-xs text-[var(--ink-muted)]">{bidDecision.reason}</p>
            ) : null}

            <div className="mt-3 grid gap-2">
              <form action={watchListingAction}>
                <input type="hidden" name="listingId" value={listing.id} />
                <input type="hidden" name="slug" value={listing.slug} />
                <Button className="w-full">
                  <Heart size={16} /> Watch
                </Button>
              </form>
              <form action={makeOfferAction} className="grid gap-2">
                <input type="hidden" name="listingId" value={listing.id} />
                <input type="hidden" name="slug" value={listing.slug} />
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Input name="amount" defaultValue={String(Math.round((listing.buyNowCents ?? listing.priceCents) / 100))} aria-label="Offer amount" />
                  <Button>
                    <Tag size={16} /> Offer
                  </Button>
                </div>
                <Input name="message" defaultValue="Can complete pickup or shipping this week." aria-label="Offer message" />
              </form>
              <form action={messageSellerAction} className="grid gap-2">
                <input type="hidden" name="listingId" value={listing.id} />
                <input type="hidden" name="slug" value={listing.slug} />
                <Input name="message" defaultValue="Is this still available with all listed accessories?" aria-label="Message seller" />
                <Button>
                  <MessageSquare size={16} /> Message seller
                </Button>
              </form>
            </div>

            <div className="bid-history">
              <div className="mb-2 text-sm font-bold">Bid history</div>
              {listingBids.map((bid, index) => (
                <div key={bid.id} className={index === 0 ? "bid-history-item top" : "bid-history-item"}>
                  <div>
                    <div className="capitalize">{bid.status.toLowerCase()}</div>
                    <div className="mono text-[10px] text-[var(--ink-4)]">{new Date(bid.createdAt).toLocaleTimeString("en-US")}</div>
                  </div>
                  <span className="mono">{formatMoney(bid.amountCents, currency)}</span>
                </div>
              ))}
              {listingBids.length === 0 ? <div className="text-sm text-[var(--ink-muted)]">No bids yet.</div> : null}
            </div>
          </div>

          <Card className="mt-4 p-5">
            <div className="text-sm font-bold">Seller</div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">{listing.seller.displayName}</div>
                <div className="text-sm text-[var(--ink-muted)]">@{listing.seller.handle}</div>
              </div>
              <Badge tone={listing.seller.rating === null ? "neutral" : "good"}>
                {listing.seller.rating === null ? "New seller" : `${listing.seller.rating.toFixed(1)} / 5`}
              </Badge>
            </div>
            <div className="mt-3 text-sm text-[var(--ink-muted)]">
              {listing.seller.rating === null
                ? "No buyer reviews yet."
                : `${listing.seller.rating.toFixed(1)} from ${listing.seller.reviewCount} buyer review${listing.seller.reviewCount === 1 ? "" : "s"}.`}
            </div>
            <div className="mt-3 text-sm text-[var(--ink-muted)]">Response time: {listing.seller.responseTime}</div>
          </Card>

          {reviewEligibility?.canReview ? (
            <Card className="mt-4 p-5">
              <h2 className="flex items-center gap-2 text-base font-bold"><Star size={17} className="text-[var(--accent)]" /> Rate your accepted offer</h2>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">Your review helps buyers assess {reviewEligibility.sellerName}. You can submit one review after the seller accepts your offer.</p>
              <form action={submitSellerReviewAction} className="mt-4 grid gap-3">
                <input type="hidden" name="listingId" value={listing.id} />
                <input type="hidden" name="slug" value={listing.slug} />
                <Field label="Rating">
                  <select name="rating" defaultValue="5" className="focus-ring h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm">
                    <option value="5">5 - Excellent</option><option value="4">4 - Good</option><option value="3">3 - Fair</option><option value="2">2 - Poor</option><option value="1">1 - Very poor</option>
                  </select>
                </Field>
                <Field label="Review (optional)"><Textarea name="comment" placeholder="Describe the item accuracy, communication, and handoff." /></Field>
                <Button variant="primary">Submit review</Button>
              </form>
            </Card>
          ) : reviewEligibility?.alreadyReviewed ? <Card className="mt-4 p-5 text-sm text-[var(--ink-muted)]">You have already reviewed this accepted offer.</Card> : null}
        </aside>
      </div>
    </SiteShell>
  );
}

function StatusMessage({ status }: { status: string }) {
  const copy: Record<string, string> = {
    created: "Listing submitted for review.",
    "bid-created": "Bid placed.",
    "offer-created": "Offer sent to seller.",
    "watch-created": "Listing added to watchlist.",
    "message-created": "Message sent to seller.",
    "review-created": "Thanks - your seller review is now reflected in the seller rating.",
    "review-existing": "You have already reviewed this accepted offer.",
    "review-ineligible": "Reviews are available after the seller accepts your offer.",
    "review-forbidden": "Only the signed-in buyer from an accepted offer can submit this review.",
    forbidden: "This account does not have permission for that action.",
    rejected: "Action rejected by marketplace rules.",
    missing: "Listing could not be found.",
    error: "Database action could not be saved. Check database configuration.",
    invalid: "Please check the submitted values."
  };

  return (
    <Card className="mb-4 border-[var(--accent)] bg-orange-50 p-4 text-sm font-semibold text-[var(--accent-strong)]">
      {copy[status] ?? "Action completed."}
    </Card>
  );
}

function labelize(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}
