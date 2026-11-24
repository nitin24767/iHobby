import { AccessPanel } from "@/components/access-panel";
import { AdminBulkUpload } from "@/components/admin-bulk-upload";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui";
import { getCurrentActor } from "@/lib/auth";

export default async function AdminBulkUploadPage() {
  const actor = await getCurrentActor();

  if (actor.role !== "ADMIN") {
    return (
      <SiteShell>
        <AccessPanel title="Administrator bulk-upload access required" />
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <div className="grid gap-5">
        <div>
          <Badge tone="bad">Admin only</Badge>
          <h1 className="mt-3 text-3xl font-bold">Bulk listing upload</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--ink-muted)]">
            Validate Excel or PDF listing records, match their image files, then submit valid listings to moderation.
            Nothing is created until you confirm the preview.
          </p>
        </div>
        <AdminBulkUpload />
      </div>
    </SiteShell>
  );
}
