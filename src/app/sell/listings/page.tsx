import { Boxes, Clock, Eye, Gavel, Plus, Tag } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AccessPanel } from "@/components/access-panel";
import { SiteShell } from "@/components/site-shell";
import { Badge, Button, Card, Field, Input, LinkButton, Textarea } from "@/components/ui";
import { changeSellerListingStatusAction, updateSellerListingAction } from "@/app/sell/listings/actions";
import { getCurrentActor } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/rbac";
import { listSellerInventory } from "@/lib/server/marketplace";
import { getApplicationCurrency } from "@/lib/server/application-settings";
import type { Listing, ListingStatus } from "@/types/domain";

const statusTabs = [
  { key: "all", label: "All" },
  { key: "PENDING_REVIEW", label: "Review" },
  { key: "ACTIVE", label: "Active" },
  { key: "PAUSED", label: "Paused" },
  { key: "SOLD", label: "Sold" },
  { key: "REJECTED", label: "Rejected" },
  { key: "ARCHIVED", label: "Archived" }
] as const;

type StatusFilter = (typeof statusTabs)[number]["key"];

export default async function SellerListingsPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; notice?: string }>;
}) {
  const actor = await getCurrentActor();
  const { status, notice } = await searchParams;

  if (!can(actor.role, "seller:dashboard")) {
    return (
      <SiteShell>
        <AccessPanel title="Seller access required" />
      </SiteShell>
    );
  }

  const [inventory, currency] = await Promise.all([listSellerInventory(actor), getApplicationCurrency()]);
  const activeStatus = normalizeStatusFilter(status);
  const visibleListings = activeStatus === "all"
    ? inventory
    : inventory.filter((listing) => listing.status === activeStatus);

  return (
    <SiteShell>
      <div className="page-head">
        <div>
          <Badge tone="accent">Seller inventory</Badge>
          <h1 className="page-title mt-3">My listings</h1>
          <div className="page-sub">Submitted, active, sold, rejected, and archived RC listings.</div>
        </div>
        <div className="page-actions">
          <LinkButton href="/sell/new" variant="primary">
            <Plus size={16} /> New listing
          </LinkButton>
        </div>
      </div>

      <div className="section-switch">
        {statusTabs.map((tab) => (
          <Link
            key={tab.key}
            href={tab.key === "all" ? "/sell/listings" : `/sell/listings?status=${tab.key}`}
            className={tab.key === activeStatus ? "section-tab active" : "section-tab"}
          >
            {tab.label}
            <span className="section-count">{countForStatus(inventory, tab.key)}</span>
          </Link>
        ))}
      </div>

      {notice ? <InventoryStatus status={notice} /> : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-white p-4">
          <div className="flex items-center gap-2">
            <Boxes size={18} className="text-[var(--accent)]" />
            <h2 className="text-lg font-bold">Seller inventory</h2>
          </div>
          <Badge>{visibleListings.length} listing{visibleListings.length === 1 ? "" : "s"}</Badge>
        </div>

        {visibleListings.length > 0 ? (
          <div className="divide-y divide-[var(--line)]">
            {visibleListings.map((listing) => (
              <ListingInventoryRow key={listing.id} listing={listing} currency={currency} />
            ))}
          </div>
        ) : (
          <div className="grid place-items-center gap-3 p-10 text-center">
            <div className="grid size-12 place-items-center rounded-md bg-[var(--background)] text-[var(--accent)]">
              <Boxes size={22} />
            </div>
            <div>
              <h2 className="font-bold">No listings in this view</h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">Create a new listing or switch filters.</p>
            </div>
            <LinkButton href="/sell/new" size="sm">
              <Plus size={14} /> New listing
            </LinkButton>
          </div>
        )}
      </Card>
    </SiteShell>
  );
}

function ListingInventoryRow({ listing, currency }: { listing: Listing; currency: string }) {
  const image = listing.media[0]?.url ?? "/media/drone-marketplace.svg";
  const title = listing.media[0]?.alt ?? listing.title;

  return (
    <article className="grid gap-4 p-4 md:grid-cols-[138px_minmax(0,1fr)_auto] md:items-center">
      <Link href={`/listings/${listing.slug}`} className="listing-img block rounded-md">
        <Image src={image} alt={title} fill className="object-cover" sizes="138px" />
      </Link>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="max-w-full truncate text-base font-bold">{listing.title}</h2>
          <StatusBadge status={listing.status} />
          <Badge>{listing.listingType.toLowerCase().replace("_", " ")}</Badge>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--ink-muted)]">
          <span>{listing.categoryName}</span>
          <span>{listing.condition}</span>
          <span>{listing.location}</span>
          <span className="inline-flex items-center gap-1">
            <Clock size={14} /> {new Date(listing.publishedAt).toLocaleDateString("en-US")}
          </span>
        </div>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
          <InventoryMetric icon={<Tag size={14} />} label="Price" value={formatMoney(listing.priceCents, currency)} />
          <InventoryMetric icon={<Eye size={14} />} label="Watchers" value={String(listing.stats.watchers)} />
          <InventoryMetric icon={<Gavel size={14} />} label="Bids" value={String(listing.stats.bids)} />
          <InventoryMetric icon={<Tag size={14} />} label="Offers" value={String(listing.stats.offers)} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 md:justify-end">
        <LinkButton href={`/listings/${listing.slug}`} size="sm">
          View
        </LinkButton>
        <LinkButton href={`/tools/pricing?vehicle=${listing.categorySlug}`} size="sm" variant="ghost">
          Price
        </LinkButton>
        {listing.status === "ACTIVE" ? <StatusAction listingId={listing.id} nextStatus="PAUSED" label="Pause" /> : null}
        {listing.status === "PAUSED" ? <StatusAction listingId={listing.id} nextStatus="ACTIVE" label="Resume" /> : null}
        {["PENDING_REVIEW", "ACTIVE", "PAUSED", "REJECTED"].includes(listing.status) ? (
          <StatusAction listingId={listing.id} nextStatus="ARCHIVED" label="Archive" />
        ) : null}
      </div>

      {!["SOLD", "ARCHIVED"].includes(listing.status) ? (
        <details className="md:col-start-2 md:col-end-4">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--accent-strong)]">Edit listing details</summary>
          <form action={updateSellerListingAction} className="mt-3 grid gap-3 rounded-md border border-[var(--line)] bg-[var(--background)] p-3 md:grid-cols-2">
            <input type="hidden" name="listingId" value={listing.id} />
            <Field label="Title"><Input name="title" defaultValue={listing.title} /></Field>
            <Field label={`Price (${currency})`}><Input name="price" inputMode="decimal" defaultValue={(listing.priceCents / 100).toFixed(2)} /></Field>
            <Field label="Condition"><Input name="condition" defaultValue={listing.condition} /></Field>
            <Field label="Location"><Input name="location" defaultValue={listing.location} /></Field>
            <div className="md:col-span-2"><Field label="Description"><Textarea name="description" defaultValue={listing.description} /></Field></div>
            <div className="flex justify-end md:col-span-2"><Button size="sm" variant="primary">Save changes</Button></div>
          </form>
        </details>
      ) : null}
    </article>
  );
}

function StatusAction({ listingId, nextStatus, label }: { listingId: string; nextStatus: "PAUSED" | "ACTIVE" | "ARCHIVED"; label: string }) {
  return (
    <form action={changeSellerListingStatusAction}>
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="nextStatus" value={nextStatus} />
      <Button size="sm" variant={nextStatus === "ARCHIVED" ? "ghost" : "secondary"}>{label}</Button>
    </form>
  );
}

function InventoryStatus({ status }: { status: string }) {
  const copy: Record<string, string> = {
    updated: "Listing changes saved. Active listings return to review when their sale terms are changed.",
    invalid: "Enter complete listing details and a valid price.",
    unavailable: "That listing cannot make the requested transition.",
    not_found: "That listing is unavailable or no longer belongs to this seller account.",
    forbidden: "You do not have permission to manage this listing.",
    error: "The listing could not be updated. Please try again."
  };
  return <Card className="border-[var(--accent)] bg-orange-50 p-4 text-sm font-semibold text-[var(--accent-strong)]">{copy[status] ?? "Listing status updated."}</Card>;
}

function InventoryMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md bg-[var(--background)] px-3 py-2">
      <span className="text-[var(--accent)]">{icon}</span>
      <div className="min-w-0">
        <div className="mono text-[10px] uppercase text-[var(--ink-4)]">{label}</div>
        <div className="truncate font-bold">{value}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ListingStatus }) {
  const toneMap: Record<ListingStatus, "neutral" | "accent" | "good" | "warn" | "bad" | "info"> = {
    DRAFT: "neutral",
    PENDING_REVIEW: "warn",
    ACTIVE: "good",
    PAUSED: "info",
    SOLD: "accent",
    REJECTED: "bad",
    ARCHIVED: "neutral"
  };

  return <Badge tone={toneMap[status]}>{status.toLowerCase().replace("_", " ")}</Badge>;
}

function normalizeStatusFilter(status: string | undefined): StatusFilter {
  return statusTabs.some((tab) => tab.key === status) ? (status as StatusFilter) : "all";
}

function countForStatus(listings: Listing[], status: StatusFilter) {
  if (status === "all") return listings.length;
  return listings.filter((listing) => listing.status === status).length;
}
