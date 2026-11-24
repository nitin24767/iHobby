import { Search, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ListingCard } from "@/components/listing-card";
import { SiteShell } from "@/components/site-shell";
import { Badge, Card, LinkButton } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/money";
import { getApplicationCurrency } from "@/lib/server/application-settings";
import {
  getMarketplaceScopeWithCounts,
  listComponentMarketplace,
  listMarketplaceListings,
  type ComponentListing
} from "@/lib/server/marketplace";

type Section = "vehicles" | "components";

type PageProps = {
  searchParams: Promise<{
    section?: string;
    vehicleType?: string;
    compType?: string;
    q?: string;
    sort?: "ending-soon" | "price-asc" | "price-desc" | "newest";
    condition?: string;
    minPrice?: string;
    maxPrice?: string;
  }>;
};

const CONDITIONS = ["New", "Like new", "Excellent", "Very good", "Good", "Tested", "For parts"];
const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "ending-soon", label: "Ending soon" },
  { value: "price-asc", label: "Price ↑" },
  { value: "price-desc", label: "Price ↓" }
];

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const section: Section = params.section === "components" ? "components" : "vehicles";
  const query = params.q ?? "";
  const sort = SORT_OPTIONS.some((option) => option.value === params.sort) ? params.sort ?? "newest" : "newest";
  const condition = params.condition ?? "all";
  const minPrice = parsePriceParam(params.minPrice);
  const maxPrice = parsePriceParam(params.maxPrice);
  const [scope, currency] = await Promise.all([
    getMarketplaceScopeWithCounts({ query, condition, minPrice, maxPrice }),
    getApplicationCurrency()
  ]);
  const vehicleType = scope.vehicleTypes.some((item) => item.id === params.vehicleType) ? params.vehicleType ?? "all" : "all";
  const componentOptions = scope.componentTypes[vehicleType] ?? scope.componentTypes.all;
  const compType = componentOptions.some((item) => item.id === params.compType) ? params.compType ?? "all" : "all";

  const [vehicleListings, filteredComponents] = await Promise.all([
    listMarketplaceListings({ query, category: vehicleType === "all" ? "all" : vehicleType, sort, condition: condition === "all" ? undefined : condition, minPrice, maxPrice }),
    listComponentMarketplace({
      query,
      vehicleType,
      componentType: compType,
      sort,
      condition: condition === "all" ? undefined : condition,
      minPrice,
      maxPrice
    })
  ]);

  const sectionCounts: Record<Section, number> = {
    vehicles: vehicleListings.length,
    components: filteredComponents.length
  };
  const activeCount = sectionCounts[section];
  const vehicleTypeOptions = section === "components"
    ? scope.vehicleTypes.map((item) => ({
        ...item,
        name: item.id === "all" ? "All components" : item.name,
        count: item.id === "all"
          ? scope.sections.find((scopeSection) => scopeSection.id === "components")?.count ?? 0
          : scope.componentTypes[item.id]?.find((component) => component.id === "all")?.count ?? 0
      }))
    : scope.vehicleTypes;

  const hasFilters = query || condition !== "all" || minPrice !== undefined || maxPrice !== undefined || vehicleType !== "all" || compType !== "all";

  return (
    <SiteShell>
      <div className="page-head">
        <div>
          <h1 className="page-title">Marketplace</h1>
          <div className="page-sub">
            {activeCount.toLocaleString()} {section} — {section === "vehicles" ? "live and timed auctions" : "parts, packs, and build spares"}
          </div>
        </div>
        <div className="page-actions">
          <LinkButton href="/sell/new" size="sm" variant="primary">
            Sell something
          </LinkButton>
        </div>
      </div>

      {/* Search bar */}
      <form method="GET" className="flex gap-2">
        {section !== "vehicles" && <input type="hidden" name="section" value={section} />}
        {vehicleType !== "all" && <input type="hidden" name="vehicleType" value={vehicleType} />}
        {compType !== "all" && <input type="hidden" name="compType" value={compType} />}
        {sort !== "newest" && <input type="hidden" name="sort" value={sort} />}
        {condition !== "all" && <input type="hidden" name="condition" value={condition} />}
        {minPrice !== undefined && <input type="hidden" name="minPrice" value={String(minPrice)} />}
        {maxPrice !== undefined && <input type="hidden" name="maxPrice" value={String(maxPrice)} />}
        <div className="focus-within:ring-2 focus-within:ring-[var(--ink)] flex flex-1 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3">
          <Search size={16} className="shrink-0 text-[var(--ink-muted)]" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Search vehicles, parts, sellers…"
            className="flex-1 bg-transparent py-2 text-sm outline-none"
          />
          {query && (
            <a href={clearParamHref(params, "q")} className="text-[var(--ink-muted)] hover:text-[var(--ink)]">
              <X size={14} />
            </a>
          )}
        </div>
        <button type="submit" className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-[var(--line)] bg-white px-3 text-sm font-semibold">
          <Search size={15} /> Search
        </button>
      </form>

      {/* Section tabs */}
      <div className="section-switch" role="tablist" aria-label="Marketplace scope">
        {scope.sections.map((item) => (
          <Link
            key={item.id}
            href={marketHref({ section: item.id as Section, vehicleType, q: query, sort, condition, minPrice, maxPrice })}
            className={cn("section-tab focus-ring", section === item.id && "active")}
          >
            {item.name}
            <span className="section-count mono">{sectionCounts[item.id as Section].toLocaleString()}</span>
          </Link>
        ))}
      </div>

      {/* Vehicle family pills */}
      <div className="cats" aria-label="Vehicle families">
        {vehicleTypeOptions.map((item) => (
          <Link
            key={item.id}
            href={marketHref({ section, vehicleType: item.id, q: query, sort, condition, minPrice, maxPrice })}
            className={cn("cat focus-ring", vehicleType === item.id && "active")}
          >
            {item.name}
            <span className="cat-count mono">{item.count}</span>
          </Link>
        ))}
      </div>

      {section === "components" && (
        <>
          <div className="section-title mono upper">Component type</div>
          <div className="cats" aria-label="Component types">
            {componentOptions.map((item) => (
              <Link
                key={item.id}
                href={marketHref({ section, vehicleType, compType: item.id, q: query, sort, condition, minPrice, maxPrice })}
                className={cn("cat sm focus-ring", compType === item.id && "active")}
              >
                {item.name}
                <span className="cat-count mono">{item.count}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* Filters row */}
      <div className="filters">
        {/* Sort */}
        <form method="GET">
          {section !== "vehicles" && <input type="hidden" name="section" value={section} />}
          {vehicleType !== "all" && <input type="hidden" name="vehicleType" value={vehicleType} />}
          {compType !== "all" && <input type="hidden" name="compType" value={compType} />}
          {query && <input type="hidden" name="q" value={query} />}
          {condition !== "all" && <input type="hidden" name="condition" value={condition} />}
          {minPrice !== undefined && <input type="hidden" name="minPrice" value={String(minPrice)} />}
          {maxPrice !== undefined && <input type="hidden" name="maxPrice" value={String(maxPrice)} />}
          <select
            name="sort"
            defaultValue={sort}
            className="focus-ring h-8 rounded-md border border-[var(--line)] bg-white px-2 text-xs font-semibold"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button type="submit" className="focus-ring h-8 rounded-md border border-[var(--line)] bg-white px-2 text-xs font-semibold">Sort</button>
        </form>

        {/* Condition filter */}
        <form method="GET" className="flex items-center gap-1">
          {section !== "vehicles" && <input type="hidden" name="section" value={section} />}
          {vehicleType !== "all" && <input type="hidden" name="vehicleType" value={vehicleType} />}
          {compType !== "all" && <input type="hidden" name="compType" value={compType} />}
          {query && <input type="hidden" name="q" value={query} />}
          {sort !== "newest" && <input type="hidden" name="sort" value={sort} />}
          {minPrice !== undefined && <input type="hidden" name="minPrice" value={String(minPrice)} />}
          {maxPrice !== undefined && <input type="hidden" name="maxPrice" value={String(maxPrice)} />}
          <label className="text-xs text-[var(--ink-muted)]">Condition:</label>
          <select
            name="condition"
            defaultValue={condition}
            className="focus-ring h-8 rounded-md border border-[var(--line)] bg-white px-2 text-xs font-semibold"
          >
            <option value="all">Any</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button type="submit" className="focus-ring h-8 rounded-md border border-[var(--line)] bg-white px-2 text-xs font-semibold">Apply</button>
        </form>

        {/* Price range */}
        <form method="GET" className="flex items-center gap-1">
          {section !== "vehicles" && <input type="hidden" name="section" value={section} />}
          {vehicleType !== "all" && <input type="hidden" name="vehicleType" value={vehicleType} />}
          {compType !== "all" && <input type="hidden" name="compType" value={compType} />}
          {query && <input type="hidden" name="q" value={query} />}
          {sort !== "newest" && <input type="hidden" name="sort" value={sort} />}
          {condition !== "all" && <input type="hidden" name="condition" value={condition} />}
          <label className="text-xs text-[var(--ink-muted)]">$</label>
          <input
            name="minPrice"
            type="number"
            min="0"
            defaultValue={minPrice}
            placeholder="Min"
            className="focus-ring h-8 w-20 rounded-md border border-[var(--line)] bg-white px-2 text-xs"
          />
          <span className="text-xs text-[var(--ink-muted)]">–</span>
          <input
            name="maxPrice"
            type="number"
            min="0"
            defaultValue={maxPrice}
            placeholder="Max"
            className="focus-ring h-8 w-20 rounded-md border border-[var(--line)] bg-white px-2 text-xs"
          />
          <button type="submit" className="focus-ring h-8 rounded-md border border-[var(--line)] bg-white px-2 text-xs font-semibold">Apply</button>
        </form>

        {hasFilters && (
          <a
            href={marketHref({ section, sort })}
            className="filter focus-ring text-[var(--accent)]"
          >
            <X size={13} /> Clear filters
          </a>
        )}
      </div>

      {section === "vehicles" ? (
        <section className="grid-listings" aria-label="Vehicle listings">
          {vehicleListings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} currency={currency} />
          ))}
        </section>
      ) : (
        <section className="grid-listings" aria-label="Component listings">
          {filteredComponents.map((component) => (
            <ComponentCard key={component.id} component={component} currency={currency} />
          ))}
        </section>
      )}

      {activeCount === 0 && (
        <Card className="mt-5 grid place-items-center border-dashed p-10 text-center">
          <h2 className="text-lg font-bold">No RC listings matched</h2>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            {hasFilters ? "Try adjusting your filters or search term." : "Check back soon — sellers are listing new items daily."}
          </p>
          <LinkButton href="/" className="mt-4" variant="primary">
            Reset filters
          </LinkButton>
        </Card>
      )}
    </SiteShell>
  );
}

function ComponentCard({ component, currency }: { component: ComponentListing; currency: string }) {
  return (
    <article className="listing">
      <div className="listing-img">
        <Image src={component.media} alt={component.title} fill className="object-cover" />
        <div className="listing-tag">
          <Badge tone="info">Component</Badge>
        </div>
      </div>
      <div className="listing-body">
        <h2 className="listing-title">{component.title}</h2>
        <div className="listing-meta">
          <span>{component.condition}</span>
          <span>{component.location}</span>
          <span>{component.stock} in stock</span>
        </div>
        <div className="listing-row">
          <div>
            <div className="listing-bid-label mono upper">Price</div>
            <div className="listing-price mono">{formatMoney(component.priceCents, currency)}</div>
          </div>
          <div className="listing-time mono">Ships 2d</div>
        </div>
      </div>
    </article>
  );
}

function marketHref({
  section,
  vehicleType,
  compType,
  q,
  sort,
  condition,
  minPrice,
  maxPrice
}: {
  section: Section;
  vehicleType?: string;
  compType?: string;
  q?: string;
  sort?: string;
  condition?: string;
  minPrice?: number;
  maxPrice?: number;
}) {
  const next = new URLSearchParams();
  if (section !== "vehicles") next.set("section", section);
  if (vehicleType && vehicleType !== "all") next.set("vehicleType", vehicleType);
  if (compType && compType !== "all") next.set("compType", compType);
  if (q) next.set("q", q);
  if (sort && sort !== "newest") next.set("sort", sort);
  if (condition && condition !== "all") next.set("condition", condition);
  if (minPrice !== undefined) next.set("minPrice", String(minPrice));
  if (maxPrice !== undefined) next.set("maxPrice", String(maxPrice));

  const qs = next.toString();
  return qs ? `/?${qs}` : "/";
}

function clearParamHref(params: Record<string, string | undefined>, key: string) {
  const next = new URLSearchParams(
    Object.entries(params).filter(([k, v]) => k !== key && v !== undefined) as [string, string][]
  );
  const qs = next.toString();
  return qs ? `/?${qs}` : "/";
}

function parsePriceParam(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}
