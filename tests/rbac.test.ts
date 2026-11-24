import { describe, expect, it } from "vitest";
import { assertCan, can, defaultDashboardFor } from "@/lib/rbac";

describe("rbac", () => {
  it("allows visitors to read listings only", () => {
    expect(can("VISITOR", "listing:read")).toBe(true);
    expect(can("VISITOR", "buyer:dashboard")).toBe(false);
    expect(can("VISITOR", "bid:create")).toBe(false);
    expect(() => assertCan("VISITOR", "admin:moderate")).toThrow(/not allowed/);
  });

  it("routes role dashboards deterministically", () => {
    expect(defaultDashboardFor("VISITOR")).toBe("/");
    expect(defaultDashboardFor("BUYER")).toBe("/dashboard/buyer");
    expect(defaultDashboardFor("SELLER")).toBe("/dashboard/seller");
    expect(defaultDashboardFor("ADMIN")).toBe("/dashboard/admin");
  });

  it("keeps buyer, seller, and admin dashboards separated", () => {
    expect(can("BUYER", "buyer:dashboard")).toBe(true);
    expect(can("BUYER", "seller:dashboard")).toBe(false);
    expect(can("BUYER", "admin:dashboard")).toBe(false);
    expect(can("SELLER", "buyer:dashboard")).toBe(false);
    expect(can("SELLER", "seller:dashboard")).toBe(true);
    expect(can("ADMIN", "buyer:dashboard")).toBe(false);
    expect(can("ADMIN", "admin:dashboard")).toBe(true);
    expect(can("ADMIN", "admin:manage-settings")).toBe(true);
    expect(can("SELLER", "admin:manage-settings")).toBe(false);
  });
});
