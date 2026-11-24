import { Prisma } from "@prisma/client";
import { z } from "zod";
import { completeAiText, type AiCompletionResult } from "@/lib/ai/providers";
import { DEFAULT_APPLICATION_CURRENCY } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import {
  getListingDetailBySlug,
  getPricingGuidanceForInput,
  listBidsForActor,
  listComponentMarketplace,
  listMarketplaceListings,
  listOffersForActor,
  listWatchlistListings
} from "@/lib/server/marketplace";
import { ensureUserForActor } from "@/lib/server/users";
import type { Actor, Listing } from "@/types/domain";

export const agentToolNames = [
  "search_marketplace",
  "get_listing_details",
  "get_pricing_guidance",
  "get_account_snapshot"
] as const;

export type AgentToolName = (typeof agentToolNames)[number];

export interface AgentStep {
  iteration: number;
  reason: string;
  tool: AgentToolName;
  input: Record<string, unknown>;
  observation: unknown;
}

export interface AgentRunResult {
  jobId: string | null;
  goal: string;
  answer: string;
  provider: string;
  model: string;
  status: "SUCCEEDED";
  steps: AgentStep[];
}

export interface AgentRunSummary {
  id: string;
  goal: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  provider: string;
  model: string;
  answer: string | null;
  stepCount: number;
  createdAt: string;
}

const toolDecisionSchema = z.object({
  type: z.literal("tool"),
  tool: z.enum(agentToolNames),
  input: z.record(z.string(), z.unknown()).default({}),
  reason: z.string().min(1).max(240)
});

const finalDecisionSchema = z.object({
  type: z.literal("final"),
  answer: z.string().min(1).max(8000)
});

const decisionSchema = z.discriminatedUnion("type", [toolDecisionSchema, finalDecisionSchema]);
export type AgentDecision = z.infer<typeof decisionSchema>;

interface AgentLoopDependencies {
  decide: (context: AgentDecisionContext) => Promise<{ decision: AgentDecision; completion: AiCompletionResult }>;
  execute: (tool: AgentToolName, input: Record<string, unknown>) => Promise<unknown>;
}

interface AgentDecisionContext {
  goal: string;
  role: Actor["role"];
  steps: AgentStep[];
  iteration: number;
}

const toolsForPrompt = [
  {
    name: "search_marketplace",
    description: "Search active RC vehicle and component listings.",
    input: { query: "string optional", category: "drones|helis|planes|cars optional", maxPrice: "number in currency units optional" }
  },
  { name: "get_listing_details", description: "Inspect one listing returned by search.", input: { slug: "string" } },
  {
    name: "get_pricing_guidance",
    description: "Calculate persisted marketplace pricing guidance.",
    input: { category: "drones|helis|planes|cars", targetPriceCents: "positive integer" }
  },
  { name: "get_account_snapshot", description: "Read the signed-in member's role-scoped bids, offers, and watchlist.", input: {} }
];

export async function runMarketplaceAgent(actor: Actor, goal: string): Promise<AgentRunResult> {
  if (!actor.isAuthenticated || !can(actor.role, "ai:use")) {
    throw new Error("Agent access requires an authenticated member account.");
  }

  const normalizedGoal = goal.trim();
  if (normalizedGoal.length < 8 || normalizedGoal.length > 1200) {
    throw new Error("Describe a goal using between 8 and 1200 characters.");
  }

  const user = await ensureUserForActor(actor);
  const job = await prisma.aiJob.create({
    data: {
      userId: user.id,
      feature: "marketplace-agent",
      provider: "pending",
      model: "pending",
      prompt: normalizedGoal,
      status: "QUEUED"
    }
  });

  await prisma.aiJob.update({ where: { id: job.id }, data: { status: "RUNNING" } });

  try {
    const loopResult = await runAgentLoop(
      { goal: normalizedGoal, role: actor.role },
      {
        decide: createModelDecision,
        execute: (tool, input) => executeAgentTool(actor, tool, input)
      }
    );
    const result: AgentRunResult = { jobId: job.id, goal: normalizedGoal, status: "SUCCEEDED", ...loopResult };

    await prisma.aiJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        provider: result.provider,
        model: result.model,
        result: toJson({ answer: result.answer, steps: result.steps })
      }
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent run failed.";
    await prisma.aiJob.update({ where: { id: job.id }, data: { status: "FAILED", error: message } }).catch(() => undefined);
    throw error;
  }
}

export async function runAgentLoop(
  input: { goal: string; role: Actor["role"]; maxSteps?: number },
  dependencies: AgentLoopDependencies
): Promise<Omit<AgentRunResult, "jobId" | "goal" | "status">> {
  const steps: AgentStep[] = [];
  const signatures = new Set<string>();
  const maxSteps = Math.min(Math.max(input.maxSteps ?? 5, 1), 6);
  let lastCompletion: AiCompletionResult = { provider: "mock", model: "local-product-helper", text: "" };

  for (let iteration = 1; iteration <= maxSteps; iteration += 1) {
    const decided = await dependencies.decide({ goal: input.goal, role: input.role, steps, iteration });
    lastCompletion = decided.completion;

    if (decided.decision.type === "final") {
      return {
        answer: isIncompleteAgentAnswer(decided.decision.answer)
          ? buildFallbackAnswer(input.goal, steps)
          : decided.decision.answer,
        provider: lastCompletion.provider,
        model: lastCompletion.model,
        steps
      };
    }

    const signature = `${decided.decision.tool}:${JSON.stringify(decided.decision.input)}`;
    if (signatures.has(signature)) break;
    signatures.add(signature);

    let observation: unknown;
    try {
      observation = await dependencies.execute(decided.decision.tool, decided.decision.input);
    } catch (error) {
      observation = { error: error instanceof Error ? error.message : "Tool execution failed." };
    }
    steps.push({
      iteration,
      reason: decided.decision.reason,
      tool: decided.decision.tool,
      input: decided.decision.input,
      observation
    });
  }

  let final: AiCompletionResult;
  try {
    final = await completeAiText({
      feature: "agent-final",
      system: "Summarize an RC marketplace agent run. Be concise, cite listing titles and prices from observations, and state limitations. Return plain text.",
      prompt: JSON.stringify({ goal: input.goal, observations: steps.map((step) => step.observation) }),
      temperature: 0.2,
      maxTokens: 700
    });
  } catch {
    final = { provider: "mock", model: "local-agent-planner", text: "" };
  }
  const answer = final.provider === "mock" ? buildFallbackAnswer(input.goal, steps) : final.text;
  return { answer, provider: final.provider, model: final.model, steps };
}

async function createModelDecision(context: AgentDecisionContext) {
  let completion: AiCompletionResult;
  try {
    completion = await completeAiText({
      feature: "agent",
      system: [
        "You are the iHobby RC marketplace agent.",
        "Choose one safe read-only tool at a time, inspect its observation, and adapt.",
        "Use at least one tool before finishing. Never claim an action was completed unless an observation proves it.",
        "A final answer must directly answer the goal from existing observations; never describe work you will do later.",
        "Return only JSON: either {\"type\":\"tool\",\"tool\":\"...\",\"input\":{},\"reason\":\"short plan\"} or {\"type\":\"final\",\"answer\":\"...\"}."
      ].join(" "),
      prompt: JSON.stringify({ goal: context.goal, role: context.role, iteration: context.iteration, tools: toolsForPrompt, priorSteps: context.steps }),
      temperature: 0.1,
      maxTokens: 700
    });
  } catch {
    completion = { provider: "mock", model: "local-agent-planner", text: "" };
  }

  let decision: AgentDecision;
  try {
    decision = completion.provider === "mock" ? mockDecision(context) : parseAgentDecision(completion.text);
  } catch {
    completion = { provider: "mock", model: "local-agent-planner", text: "" };
    decision = mockDecision(context);
  }
  return { decision, completion };
}

export function parseAgentDecision(text: string): AgentDecision {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const parsed = JSON.parse(candidate);
  return decisionSchema.parse(parsed);
}

function mockDecision(context: AgentDecisionContext): AgentDecision {
  if (context.steps.length === 0) {
    if (/\b(my|account|watchlist|bid|offer)\b/i.test(context.goal)) {
      return { type: "tool", tool: "get_account_snapshot", input: {}, reason: "Inspect the member's current marketplace activity." };
    }
    const filters = filtersFromGoal(context.goal);
    return { type: "tool", tool: "search_marketplace", input: filters, reason: "Search current marketplace inventory that matches the goal." };
  }

  const last = context.steps.at(-1);
  if (last?.tool === "search_marketplace") {
    const first = firstSearchResult(last.observation);
    if (first?.slug) {
      return { type: "tool", tool: "get_listing_details", input: { slug: first.slug }, reason: "Inspect the strongest search result before recommending it." };
    }
  }

  if (last?.tool === "get_listing_details" && /\b(price|pricing|value|worth|sell)\b/i.test(context.goal)) {
    const listing = asRecord(last.observation)?.listing;
    const row = asRecord(listing);
    if (row && typeof row.categorySlug === "string" && typeof row.priceCents === "number") {
      return {
        type: "tool",
        tool: "get_pricing_guidance",
        input: { category: row.categorySlug, targetPriceCents: row.priceCents },
        reason: "Validate the listing price against persisted marketplace guidance."
      };
    }
  }

  return { type: "final", answer: buildFallbackAnswer(context.goal, context.steps) };
}

async function executeAgentTool(actor: Actor, tool: AgentToolName, input: Record<string, unknown>) {
  if (tool === "search_marketplace") {
    const query = stringInput(input.query);
    const category = stringInput(input.category);
    const maxPrice = numberInput(input.maxPrice);
    const [vehicles, components] = await Promise.all([
      listMarketplaceListings({ query, category, maxPrice, sort: "price-asc" }),
      listComponentMarketplace({ query, vehicleType: category, maxPrice, sort: "price-asc" })
    ]);
    return {
      filters: { query, category, maxPrice },
      vehicles: vehicles.slice(0, 5).map((listing) => compactListing(listing)),
      components: components.slice(0, 5).map((item) => ({
        slug: item.slug,
        title: item.title,
        priceCents: item.priceCents,
        condition: item.condition,
        location: item.location,
        type: "component"
      }))
    };
  }

  if (tool === "get_listing_details") {
    const slug = stringInput(input.slug);
    if (!slug) throw new Error("A listing slug is required.");
    const listing = await getListingDetailBySlug(slug);
    return { listing: listing ? compactListing(listing, true) : null };
  }

  if (tool === "get_pricing_guidance") {
    const category = stringInput(input.category) || "drones";
    const targetPriceCents = Math.round(numberInput(input.targetPriceCents) ?? 0);
    if (targetPriceCents <= 0) throw new Error("A positive target price is required.");
    return getPricingGuidanceForInput(category, targetPriceCents, stringInput(input.title), stringInput(input.condition));
  }

  const [bids, offers, watchlist] = await Promise.all([
    listBidsForActor(actor),
    listOffersForActor(actor),
    listWatchlistListings(actor)
  ]);
  return {
    role: actor.role,
    bids: bids.slice(0, 5),
    offers: offers.slice(0, 5),
    watchlist: watchlist.slice(0, 5).map((listing) => compactListing(listing))
  };
}

export async function listAgentRunsForActor(actor: Actor, limit = 8): Promise<AgentRunSummary[]> {
  if (!actor.isAuthenticated || !can(actor.role, "ai:use")) return [];
  try {
    const user = await ensureUserForActor(actor);
    const jobs = await prisma.aiJob.findMany({
      where: { userId: user.id, feature: "marketplace-agent" },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 20)
    });
    return jobs.map((job) => {
      const result = asRecord(job.result);
      const steps = Array.isArray(result?.steps) ? result.steps : [];
      return {
        id: job.id,
        goal: job.prompt,
        status: job.status,
        provider: job.provider,
        model: job.model,
        answer: typeof result?.answer === "string" ? result.answer : null,
        stepCount: steps.length,
        createdAt: job.createdAt.toISOString()
      };
    });
  } catch {
    return [];
  }
}

function compactListing(listing: Listing, detailed = false) {
  return {
    slug: listing.slug,
    title: listing.title,
    categorySlug: listing.categorySlug,
    condition: listing.condition,
    priceCents: listing.priceCents,
    currency: listing.currency,
    location: listing.location,
    listingType: listing.listingType,
    seller: listing.seller.displayName,
    rating: listing.seller.rating,
    ...(detailed ? { description: listing.description, attributes: listing.attributes, stats: listing.stats } : {})
  };
}

function filtersFromGoal(goal: string) {
  const lower = goal.toLowerCase();
  const category = lower.match(/\b(drone|drones|quadcopter)\b/) ? "drones"
    : lower.match(/\b(heli|helis|helicopter)\b/) ? "helis"
      : lower.match(/\b(plane|planes|airplane)\b/) ? "planes"
        : lower.match(/\b(car|cars|truck|buggy)\b/) ? "cars" : undefined;
  const budget = lower.match(/(?:under|below|budget(?: of)?|up to)\s*\$?\s*([\d,]+)/i);
  const maxPrice = budget ? Number(budget[1].replace(/,/g, "")) : undefined;
  const query = goal
    .replace(/(?:under|below|budget(?: of)?|up to)\s*\$?\s*[\d,]+/gi, "")
    .replace(/\b(find|show|search|recommend|compare|buy|me|a|an|the|please|beginner|used|new|good|best|and|inspect|match|current|asking|price|reasonable|whether|its|is|drone|drones|quadcopter|heli|helis|helicopter|plane|planes|airplane|car|cars|truck|buggy)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { ...(query ? { query } : {}), ...(category ? { category } : {}), ...(maxPrice ? { maxPrice } : {}) };
}

function firstSearchResult(observation: unknown) {
  const record = asRecord(observation);
  const vehicles = Array.isArray(record?.vehicles) ? record.vehicles : [];
  const components = Array.isArray(record?.components) ? record.components : [];
  return asRecord([...vehicles, ...components][0]);
}

function buildFallbackAnswer(goal: string, steps: AgentStep[]) {
  const searchStep = steps.find((step) => step.tool === "search_marketplace");
  const detailStep = steps.find((step) => step.tool === "get_listing_details");
  const accountStep = steps.find((step) => step.tool === "get_account_snapshot");
  const pricingStep = steps.find((step) => step.tool === "get_pricing_guidance");

  if (accountStep) {
    const account = asRecord(accountStep.observation);
    return `I reviewed your account activity for “${goal}”. You currently have ${arrayLength(account?.bids)} recent bids, ${arrayLength(account?.offers)} recent offers, and ${arrayLength(account?.watchlist)} saved listings in the agent snapshot.`;
  }

  const listing = asRecord(asRecord(detailStep?.observation)?.listing) ?? firstSearchResult(searchStep?.observation);
  if (!listing) return `I searched the current marketplace for “${goal}” but found no matching active inventory. Try a broader vehicle family, fewer keywords, or a higher budget.`;
  const price = typeof listing.priceCents === "number" ? formatAgentMoney(listing.priceCents, String(listing.currency ?? DEFAULT_APPLICATION_CURRENCY)) : "an unlisted price";
  const pricing = asRecord(pricingStep?.observation);
  const recommended = asRecord(pricing?.guidance)?.recommendedCents;
  const guidance = typeof recommended === "number" ? ` Persisted market guidance recommends about ${formatAgentMoney(recommended, String(listing.currency ?? DEFAULT_APPLICATION_CURRENCY))}.` : "";
  return `I searched current inventory and inspected “${String(listing.title)}” at ${price}. It is listed in ${String(listing.condition ?? "unspecified")} condition by ${String(listing.seller ?? "the seller")}.${guidance} Open /listings/${String(listing.slug)} to review the full listing before bidding or making an offer.`;
}

function formatAgentMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function isIncompleteAgentAnswer(answer: string) {
  return /\b(i|we)\s+(will|can)\s+(now|next|then)|\bnext\s+(i|we)\s+will|\bneed to\s+(search|inspect|compare|check)/i.test(answer);
}

function stringInput(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : undefined;
}

function numberInput(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
