import { notFound, redirect } from "next/navigation";
import { ListingCard } from "@/components/listing-card";
import { SiteShell } from "@/components/site-shell";
import { Badge, Card, LinkButton } from "@/components/ui";
import { getApplicationCurrency } from "@/lib/server/application-settings";
import { listMarketplaceCategories, listMarketplaceListings } from "@/lib/server/marketplace";

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug === "helicopters") redirect("/categories/helis");

  const categories = await listMarketplaceCategories();
  const category = categories.find((item) => item.slug === slug);
  if (!category) notFound();

  const [listings, currency] = await Promise.all([
    listMarketplaceListings({ category: category.slug, sort: "newest" }),
    getApplicationCurrency()
  ]);

  return (
    <SiteShell>
      <div className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge tone="info">Vehicle family</Badge>
            <h1 className="mt-3 text-3xl font-bold">{category.name}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-muted)]">{category.description}</p>
          </div>
          <LinkButton href="/sell/new" variant="primary">Create listing</LinkButton>
        </div>

        <Card className="p-4">
          <div className="text-sm font-bold">Required attributes</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {category.attributes.required.map((attribute) => (
              <Badge key={attribute} tone="accent">{attribute}</Badge>
            ))}
            {category.attributes.optional.map((attribute) => (
              <Badge key={attribute}>{attribute}</Badge>
            ))}
          </div>
        </Card>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} currency={currency} />
          ))}
        </section>
      </div>
    </SiteShell>
  );
}
