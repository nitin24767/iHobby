import { AccessPanel } from "@/components/access-panel";
import { AiPricingEstimator } from "@/components/ai-pricing-estimator";
import { SiteShell } from "@/components/site-shell";
import { Badge } from "@/components/ui";
import { getCurrentActor } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getPricingEngineData } from "@/lib/server/marketplace";
import { getApplicationCurrency } from "@/lib/server/application-settings";
import { getPricingSearchDashboard } from "@/lib/server/pricing-searches";

export default async function PricingEnginePage() {
  const actor = await getCurrentActor();

  if (!can(actor.role, "ai:use")) {
    return (
      <SiteShell>
        <AccessPanel title="Member access required" />
      </SiteShell>
    );
  }

  const [pricing, currency, searchDashboard] = await Promise.all([
    getPricingEngineData("drones"),
    getApplicationCurrency(),
    getPricingSearchDashboard(actor)
  ]);

  return (
    <SiteShell>
      <div className="page-head">
        <div>
          <Badge tone="accent">Pricing</Badge>
          <h1 className="page-title mt-3">Pricing Engine</h1>
          <div className="page-sub">Estimate auction and buy-now ranges from RC condition, specs, and market comps.</div>
        </div>
      </div>

      <AiPricingEstimator pricing={pricing} currency={currency} searchDashboard={searchDashboard} />
    </SiteShell>
  );
}
