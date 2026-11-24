import { describe, expect, it } from "vitest";
import { parseAgentDecision, runAgentLoop, type AgentDecision } from "@/lib/ai/agent";

describe("marketplace agent", () => {
  it("parses fenced tool decisions", () => {
    expect(parseAgentDecision('```json\n{"type":"tool","tool":"search_marketplace","input":{"category":"drones"},"reason":"Search inventory"}\n```')).toEqual({
      type: "tool",
      tool: "search_marketplace",
      input: { category: "drones" },
      reason: "Search inventory"
    });
  });

  it("runs a plan-act-observe loop before returning the outcome", async () => {
    const decisions: AgentDecision[] = [
      { type: "tool", tool: "search_marketplace", input: { category: "drones" }, reason: "Find candidates" },
      { type: "tool", tool: "get_listing_details", input: { slug: "starter-drone" }, reason: "Inspect candidate" },
      { type: "final", answer: "The starter drone is the strongest match." }
    ];
    const called: string[] = [];
    const result = await runAgentLoop(
      { goal: "Find a starter drone", role: "BUYER" },
      {
        decide: async () => ({
          decision: decisions.shift()!,
          completion: { provider: "groq", model: "test-model", text: "" }
        }),
        execute: async (tool) => {
          called.push(tool);
          return tool === "search_marketplace"
            ? { vehicles: [{ slug: "starter-drone" }] }
            : { listing: { slug: "starter-drone", title: "Starter Drone" } };
        }
      }
    );

    expect(called).toEqual(["search_marketplace", "get_listing_details"]);
    expect(result.answer).toContain("strongest match");
    expect(result.steps).toHaveLength(2);
    expect(result.provider).toBe("groq");
  });

  it("stops duplicate tool calls to bound the loop", async () => {
    const result = await runAgentLoop(
      { goal: "Find a drone", role: "BUYER", maxSteps: 4 },
      {
        decide: async () => ({
          decision: { type: "tool", tool: "search_marketplace", input: {}, reason: "Search again" },
          completion: { provider: "mock", model: "mock", text: "" }
        }),
        execute: async () => ({ vehicles: [] })
      }
    );

    expect(result.steps).toHaveLength(1);
    expect(result.answer).toContain("found no matching active inventory");
  });
});
