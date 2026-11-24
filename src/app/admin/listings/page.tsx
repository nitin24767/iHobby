import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";
import { approveListingAction, rejectListingAction, resolveReportAction } from "@/app/admin/listings/actions";
import { AccessPanel } from "@/components/access-panel";
import { SiteShell } from "@/components/site-shell";
import { Badge, Button, Card, LinkButton } from "@/components/ui";
import { getCurrentActor } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { can } from "@/lib/rbac";
import { listAdminListings, listReportsForAdmin } from "@/lib/server/marketplace";
import { getApplicationCurrency } from "@/lib/server/application-settings";

export default async function AdminListingsPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; tab?: string }>;
}) {
  const actor = await getCurrentActor();
  const { status, tab } = await searchParams;

  if (!can(actor.role, "admin:moderate")) {
    return (
      <SiteShell>
        <AccessPanel title="Admin moderation access required" />
      </SiteShell>
    );
  }

  const activeTab = tab === "all" || tab === "reports" ? tab : "queue";
  const [reports, allListings, currency] = await Promise.all([
    listReportsForAdmin(),
    listAdminListings(),
    getApplicationCurrency()
  ]);
  const pendingListings = allListings.filter((l) => l.status === "PENDING_REVIEW");

  return (
    <SiteShell>
      <div className="grid gap-5">
        <div>
          <Badge tone="bad">Moderation</Badge>
          <h1 className="mt-3 text-3xl font-bold">Listing moderation</h1>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            Approve pending submissions, reject rule-breakers, and resolve trust reports.
          </p>
        </div>

        {status ? <StatusMessage status={status} /> : null}

        <div className="flex gap-2 border-b border-[var(--line)]">
          <TabLink href="/admin/listings?tab=queue" active={activeTab === "queue"}>
            Review queue <span className="ml-1 rounded bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">{pendingListings.length}</span>
          </TabLink>
          <TabLink href="/admin/listings?tab=all" active={activeTab === "all"}>
            All listings
          </TabLink>
          <TabLink href="/admin/listings?tab=reports" active={activeTab === "reports"}>
            Reports <span className="ml-1 rounded bg-[var(--warn)] px-1.5 py-0.5 text-[10px] font-bold text-white">{reports.filter((r) => r.status === "OPEN" || r.status === "REVIEWING").length}</span>
          </TabLink>
        </div>

        {activeTab === "queue" && (
          <Card className="overflow-hidden">
            {pendingListings.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--ink-muted)]">No listings pending review.</div>
            ) : (
              <div className="divide-y divide-[var(--line)]">
                {pendingListings.map((listing) => (
                  <div key={listing.id} className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-bold">{listing.title}</h2>
                        <Badge tone="warn">Pending review</Badge>
                        <Badge tone="neutral">{listing.categoryName}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-[var(--ink-muted)]">
                        Seller: {listing.sellerName} · {formatMoney(listing.priceCents, currency)} · Submitted {new Date(listing.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <LinkButton href={`/listings/${listing.slug}`} size="sm" variant="ghost">
                        <ExternalLink size={13} /> Preview
                      </LinkButton>
                      <form action={approveListingAction}>
                        <input type="hidden" name="listingId" value={listing.id} />
                        <Button size="sm" type="submit">
                          <CheckCircle2 size={15} /> Approve
                        </Button>
                      </form>
                      <RejectForm listingId={listing.id} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {activeTab === "all" && (
          <Card className="overflow-hidden">
            <div className="divide-y divide-[var(--line)]">
              {allListings.map((listing) => (
                <div key={listing.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{listing.title}</span>
                      <StatusBadge status={listing.status} />
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--ink-muted)]">
                      {listing.sellerName} · {listing.categoryName} · {formatMoney(listing.priceCents, currency)}
                    </div>
                  </div>
                  <LinkButton href={`/listings/${listing.slug}`} size="sm" variant="ghost">
                    <ExternalLink size={13} /> View
                  </LinkButton>
                  {listing.status === "ACTIVE" && (
                    <RejectForm listingId={listing.id} label="Remove" />
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {activeTab === "reports" && (
          <Card className="overflow-hidden">
            <div className="divide-y divide-[var(--line)]">
              {reports.map((report) => (
                <div key={report.id} className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold">{report.listingTitle}</h2>
                      <Badge tone={report.status === "OPEN" || report.status === "REVIEWING" ? "warn" : "neutral"}>{report.status.toLowerCase()}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-[var(--ink-muted)]">{report.reason}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <LinkButton href={`/listings/${allListings.find((l) => l.id === report.listingId)?.slug ?? "#"}`} size="sm" variant="ghost">
                      <ExternalLink size={13} /> Inspect
                    </LinkButton>
                    <form action={resolveReportAction}>
                      <input type="hidden" name="reportId" value={report.id} />
                      <input type="hidden" name="resolution" value="RESOLVED" />
                      <input type="hidden" name="returnTo" value="moderation-reports" />
                      <Button size="sm" disabled={report.status !== "OPEN" && report.status !== "REVIEWING"}>
                        <CheckCircle2 size={15} /> Resolve
                      </Button>
                    </form>
                    <form action={resolveReportAction}>
                      <input type="hidden" name="reportId" value={report.id} />
                      <input type="hidden" name="resolution" value="DISMISSED" />
                      <input type="hidden" name="returnTo" value="moderation-reports" />
                      <Button size="sm" variant="danger" disabled={report.status !== "OPEN" && report.status !== "REVIEWING"}>
                        <XCircle size={15} /> Dismiss
                      </Button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </SiteShell>
  );
}

function RejectForm({ listingId, label = "Reject" }: { listingId: string; label?: string }) {
  return (
    <form action={rejectListingAction} className="flex gap-2">
      <input type="hidden" name="listingId" value={listingId} />
      <input
        name="reason"
        placeholder="Rejection reason…"
        className="focus-ring h-8 rounded-md border border-[var(--line)] px-2 text-xs"
        required
      />
      <Button size="sm" variant="danger" type="submit">
        <XCircle size={15} /> {label}
      </Button>
    </form>
  );
}

function StatusBadge({ status }: { status: string }) {
  const toneMap: Record<string, "good" | "warn" | "bad" | "neutral" | "info" | "accent"> = {
    ACTIVE: "good",
    PENDING_REVIEW: "warn",
    REJECTED: "bad",
    DRAFT: "neutral",
    PAUSED: "info",
    SOLD: "accent",
    ARCHIVED: "neutral"
  };
  return <Badge tone={toneMap[status] ?? "neutral"}>{status.toLowerCase().replace("_", " ")}</Badge>;
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className={`inline-flex items-center gap-1 border-b-2 px-4 py-2.5 text-sm font-semibold ${
        active
          ? "border-[var(--ink)] text-[var(--ink)]"
          : "border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]"
      }`}
    >
      {children}
    </a>
  );
}

function StatusMessage({ status }: { status: string }) {
  const copy: Record<string, string> = {
    approved: "Listing approved and now live.",
    rejected: "Listing rejected and seller notified.",
    ok: "Report updated.",
    forbidden: "Admin moderation access required.",
    missing: "Listing or report not found.",
    invalid: "Invalid action.",
    error: "Action failed. Check database configuration."
  };
  const tone = status === "approved" || status === "ok" ? "border-green-200 bg-green-50 text-green-800" : "border-[var(--accent)] bg-orange-50 text-[var(--accent-strong)]";
  return (
    <Card className={`border p-4 text-sm font-semibold ${tone}`}>
      {copy[status] ?? "Action completed."}
    </Card>
  );
}
