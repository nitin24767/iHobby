import { Bot } from "lucide-react";
import { AccessPanel } from "@/components/access-panel";
import { MarketplaceAgent } from "@/components/marketplace-agent";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui";
import { getCurrentActor } from "@/lib/auth";
import { listAgentRunsForActor } from "@/lib/ai/agent";
import { can } from "@/lib/rbac";

export default async function MarketplaceAgentPage() {
  const actor = await getCurrentActor();
  if (!actor.isAuthenticated || !can(actor.role, "ai:use")) {
    return <SiteShell><AccessPanel title="Member access required" /></SiteShell>;
  }
  const runs = await listAgentRunsForActor(actor);
  return (
    <SiteShell>
      <div className="page-head">
        <div>
          <Badge tone="accent"><Bot size={14} className="mr-1" /> Agentic AI</Badge>
          <h1 className="page-title mt-3">Marketplace Agent</h1>
          <div className="page-sub">Set a goal and review the agent&apos;s tool choices, observations, and persisted outcome.</div>
        </div>
      </div>
      <MarketplaceAgent initialRuns={runs} />
    </SiteShell>
  );
}
