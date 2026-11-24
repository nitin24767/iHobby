import { Clock, Eye, Heart, MapPin, MessageCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import type { Listing } from "@/types/domain";

export function ListingCard({ listing, currency = listing.currency }: { listing: Listing; currency?: string }) {
  const isAuction = listing.listingType === "AUCTION";

  return (
    <article className="listing">
      <div className="listing-img">
        <Link href={`/listings/${listing.slug}`} className="focus-ring block h-full">
          <Image
            src={listing.media[0]?.url ?? "/media/drone-marketplace.svg"}
            alt={listing.media[0]?.alt ?? listing.title}
            fill
            className="object-cover"
          />
        </Link>
        <div className="listing-tag">
          <Badge tone={isAuction ? "bad" : listing.listingType === "FIXED_PRICE" ? "info" : "accent"}>
            {isAuction ? "Live" : listing.listingType === "FIXED_PRICE" ? "Buy now" : "Offers"}
          </Badge>
        </div>
        <button className="listing-watch focus-ring" aria-label={`Watch ${listing.title}`}>
          <Heart size={15} />
        </button>
      </div>
      <div className="listing-body">
        <Link href={`/listings/${listing.slug}`} className="focus-ring rounded-sm">
          <h2 className="listing-title">{listing.title}</h2>
        </Link>
        <div className="listing-meta">
          <span>
            <MapPin size={13} /> {listing.location}
          </span>
          <span>
            <Eye size={13} /> {listing.stats.watchers}
          </span>
          <span>
            <MessageCircle size={13} /> {listing.stats.offers}
          </span>
        </div>
        <div className="listing-row">
          <div>
            <div className="listing-bid-label mono upper">{isAuction ? "Current bid" : "Price"}</div>
            <div className="listing-price mono">{formatMoney(listing.priceCents, currency)}</div>
          </div>
          <div className="listing-time mono">
            <Clock className="mr-1 inline" size={13} />
            {endingLabel(listing.endsAt)}
          </div>
        </div>
      </div>
    </article>
  );
}

function endingLabel(endsAt?: string) {
  if (!endsAt) return "Open";

  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return "Ended";

  const hours = Math.ceil(diff / 36e5);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  const remainder = hours % 24;
  return `${days}d ${remainder}h`;
}
