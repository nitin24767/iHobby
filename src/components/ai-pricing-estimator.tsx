"use client";

import { BarChart3, Clock3, ExternalLink, Loader2, Search, Tag } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Button, Card, Field, Input } from "@/components/ui";
import { DEFAULT_APPLICATION_CURRENCY } from "@/lib/currency";
import { formatMoney } from "@/lib/money";
import { modelsForBrand, pricingOptionsFor } from "@/lib/rc-pricing-options";
import type { PricingSearchHistoryItem } from "@/lib/server/pricing-searches";

const PRICING_CONDITIONS = ["New", "Used - Excellent condition", "Used - Good condition", "Used - Average condition", "Used - Bad condition"] as const;

type PricingEstimatorData = {
  vehicleTypes: Array<{ id: string; name: string; count: number }>;
  selectedVehicleFamily: string;
  listingTitle: string;
  listingCondition: string;
  brand: string;
  model: string;
  scale: string;
  versionModelYear: string;
  batteryCells: number;
  currentPriceCents: number;
  comparableSales: Array<{ id: string; title: string; condition: string; soldPriceCents: number }>;
  guidance: { conservativeCents: number; recommendedCents: number; buyNowCents: number };
  note: string;
};

type MarketResult = Pick<PricingEstimatorData, "comparableSales" | "guidance" | "note">;
type WebComparable = { id: string; title: string; condition: string; priceCents: number; source: string; url: string; priceType: "asking" | "sold" | "retail" };
type ResearchResult = { webComparables: WebComparable[]; confidence: "high" | "medium" | "low" | "insufficient"; evidenceCount: number; researchedAt: string | null; webSearchUsed: boolean };
type SearchDashboard = { history: PricingSearchHistoryItem[]; remainingRequests: number | null; limit: number | null; resetAt: string | null; adminView: boolean };
type PricingResponse = Partial<MarketResult & ResearchResult> & { text?: string; provider?: string; error?: string; search?: PricingSearchHistoryItem; remainingRequests?: number | null; resetAt?: string | null };

export function AiPricingEstimator({ pricing, currency = DEFAULT_APPLICATION_CURRENCY, searchDashboard }: { pricing: PricingEstimatorData; currency?: string; searchDashboard: SearchDashboard }) {
  const [vehicleType, setVehicleType] = useState(pricing.selectedVehicleFamily);
  const [title, setTitle] = useState("");
  const [condition, setCondition] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [scale, setScale] = useState("");
  const [versionModelYear, setVersionModelYear] = useState("");
  const [batteryCells, setBatteryCells] = useState("");
  const [price, setPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ text: string; provider: string } | null>(null);
  const [market, setMarket] = useState<MarketResult>({ comparableSales: [], guidance: { conservativeCents: 0, recommendedCents: 0, buyNowCents: 0 }, note: "Enter the RC model details to research current market evidence." });
  const [research, setResearch] = useState<ResearchResult>({ webComparables: [], confidence: "insufficient", evidenceCount: 0, researchedAt: null, webSearchUsed: false });
  const [history, setHistory] = useState(searchDashboard.history);
  const [remainingRequests, setRemainingRequests] = useState(searchDashboard.remainingRequests);
  const [resetAt, setResetAt] = useState(searchDashboard.resetAt);
  const [error, setError] = useState<string | null>(null);
  const options = pricingOptionsFor(vehicleType);
  const modelOptions = useMemo(() => modelsForBrand(vehicleType, brand), [vehicleType, brand]);

  function changeVehicleFamily(next: string) {
    setVehicleType(next);
    setTitle("");
    setBrand("");
    setModel("");
    setScale("");
    setVersionModelYear("");
    setBatteryCells("");
  }

  async function requestEstimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetPriceCents = Math.round(Number(price) * 100);
    const cellCount = Number(batteryCells);
    const hasCellCount = batteryCells.trim() !== "";
    if (!title.trim() || !brand.trim() || !model.trim() || !condition || !Number.isFinite(targetPriceCents) || targetPriceCents <= 0 || (hasCellCount && (!Number.isInteger(cellCount) || cellCount < 1 || cellCount > 16))) {
      setError("Enter a title, brand, model, condition, price greater than zero, and a valid whole-number cell count.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/ai/pricing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), category: vehicleType, condition, targetPriceCents,
          attributes: {
            brand: brand.trim(), model: model.trim(),
            ...(scale.trim() ? { scale: scale.trim() } : {}),
            ...(versionModelYear.trim() ? { versionModelYear: versionModelYear.trim() } : {}),
            ...(hasCellCount ? { cellCount } : {})
          }
        })
      });
      const payload = await response.json() as PricingResponse;
      if (payload.remainingRequests !== undefined) setRemainingRequests(payload.remainingRequests);
      if (payload.resetAt !== undefined) setResetAt(payload.resetAt);
      if (!response.ok) {
        setError(payload.error ?? "AI pricing is temporarily unavailable.");
        return;
      }

      setResult({ text: payload.text ?? "No pricing recommendation returned.", provider: payload.provider ?? "AI" });
      if (payload.guidance && payload.comparableSales && payload.note) setMarket({ guidance: payload.guidance, comparableSales: payload.comparableSales, note: payload.note });
      if (payload.webComparables && payload.confidence && typeof payload.evidenceCount === "number") {
        setResearch({ webComparables: payload.webComparables, confidence: payload.confidence, evidenceCount: payload.evidenceCount, researchedAt: payload.researchedAt ?? null, webSearchUsed: payload.webSearchUsed ?? false });
      }
      if (payload.search) {
        setHistory((current) => {
          const next = [payload.search!, ...current.filter((item) => item.id !== payload.search!.id)];
          return searchDashboard.adminView ? next : next.slice(0, 3);
        });
      }
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="p-5">
          <QuotaNotice remaining={remainingRequests} limit={searchDashboard.limit} resetAt={resetAt} />
          <form onSubmit={requestEstimate} className="mt-4 grid gap-4">
            <Field label="Vehicle family">
              <select value={vehicleType} onChange={(event) => changeVehicleFamily(event.target.value)} className="focus-ring h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm">
                {pricing.vehicleTypes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <Field label="Listing title"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Arrma Kraton 6S RC Car" required /></Field>
            <EditableSuggestions label="Brand" value={brand} onChange={setBrand} options={options.brands} listId="pricing-brands" placeholder="Choose or type a brand" required />
            <EditableSuggestions label="Model" value={model} onChange={setModel} options={modelOptions} listId="pricing-models" placeholder="Choose or type a model" required />
            <EditableSuggestions label="Scale" value={scale} onChange={setScale} options={options.scales} listId="pricing-scales" placeholder="Choose or type a scale" />
            <EditableSuggestions label="Version / model year" value={versionModelYear} onChange={setVersionModelYear} options={options.versions} listId="pricing-versions" placeholder="Choose or type a version" />
            <Field label="Condition">
              <select value={condition} onChange={(event) => setCondition(event.target.value)} required className="focus-ring h-10 rounded-md border border-[var(--line)] bg-white px-3 text-sm">
                <option value="" disabled>Select condition</option>
                {PRICING_CONDITIONS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Current price"><Input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" placeholder="50000" required /></Field>
            <Field label="Battery cells (S)" hint="Enter 6 for a 6S LiPo setup."><Input value={batteryCells} onChange={(event) => setBatteryCells(event.target.value)} inputMode="numeric" min={1} max={16} /></Field>
            <Button variant="primary" type="submit" disabled={loading || remainingRequests === 0}>
              {loading ? <><Loader2 size={16} className="animate-spin" /> Researching market...</> : <><Search size={16} /> Research current market</>}
            </Button>
          </form>
          {error && <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div>}
          {result && <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--background)] p-3" aria-live="polite"><div className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-muted)]">Evidence summary · {result.provider}</div><div className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[var(--ink)]">{result.text}</div></div>}
        </Card>

        <div className="grid gap-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-lg font-bold"><BarChart3 size={20} /> Evidence-based range</h2><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${confidenceClass(research.confidence)}`}>{research.confidence} confidence · {research.evidenceCount} source{research.evidenceCount === 1 ? "" : "s"}</span></div>
            <div className="mt-5 grid gap-4 md:grid-cols-3"><Price label="Conservative" value={market.guidance.conservativeCents} currency={currency} /><Price label="Recommended" value={market.guidance.recommendedCents} currency={currency} /><Price label="Buy now" value={market.guidance.buyNowCents} currency={currency} /></div>
            <p className="mt-5 text-sm leading-6 text-[var(--ink-muted)]">{market.note}</p>
          </Card>
          <Card className="overflow-hidden">
            <div className="border-b border-[var(--line)] p-4"><h2 className="text-lg font-bold">Market evidence</h2><p className="mt-1 text-xs text-[var(--ink-muted)]">Persisted sold records and current sourced web prices.</p></div>
            <div className="divide-y divide-[var(--line)]">
              {research.webComparables.map((comp) => <a key={comp.id} href={comp.url} target="_blank" rel="noreferrer" className="grid gap-3 p-4 hover:bg-[var(--background)] sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="font-bold">{comp.title}</span><span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-bold uppercase">{comp.priceType}</span></div><div className="mt-1 flex items-center gap-1 text-sm text-[var(--ink-muted)]">{comp.source} · {comp.condition} <ExternalLink size={12} /></div></div><div className="mono font-bold">{formatMoney(comp.priceCents, currency)}</div></a>)}
              {market.comparableSales.map((comp) => <div key={comp.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="font-bold">{comp.title}</div><div className="mt-1 text-sm text-[var(--ink-muted)]">{comp.condition}</div></div><div className="mono font-bold">{formatMoney(comp.soldPriceCents, currency)}</div></div>)}
              {research.webComparables.length === 0 && market.comparableSales.length === 0 ? <div className="p-4 text-sm text-[var(--ink-muted)]">No market evidence loaded yet.</div> : null}
            </div>
            {research.researchedAt ? <div className="border-t border-[var(--line)] p-3 text-xs text-[var(--ink-muted)]">Web search {research.webSearchUsed ? "completed" : "unavailable"} {new Date(research.researchedAt).toLocaleString()}.</div> : null}
          </Card>
        </div>
      </div>
      <SearchHistory history={history} adminView={searchDashboard.adminView} />
    </div>
  );
}

function EditableSuggestions({ label, value, onChange, options, listId, placeholder, required = false }: { label: string; value: string; onChange: (value: string) => void; options: string[]; listId: string; placeholder: string; required?: boolean }) {
  return <Field label={label}><Input list={listId} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} /><datalist id={listId}>{options.map((option) => <option key={option} value={option} />)}</datalist></Field>;
}

function QuotaNotice({ remaining, limit, resetAt }: { remaining: number | null; limit: number | null; resetAt: string | null }) {
  if (remaining === null) return <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">Administrator account · unlimited pricing requests</div>;
  return <div className={`rounded-md border p-3 text-sm ${remaining ? "border-blue-200 bg-blue-50 text-blue-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}><div className="font-semibold">{remaining} of {limit} pricing requests remaining</div><div className="mt-1 text-xs">Rolling 24-hour allowance{resetAt ? ` · next request resets ${new Date(resetAt).toLocaleString()}` : ""}</div></div>;
}

function SearchHistory({ history, adminView }: { history: PricingSearchHistoryItem[]; adminView: boolean }) {
  return <Card className="overflow-hidden"><div className="border-b border-[var(--line)] p-4"><h2 className="flex items-center gap-2 text-lg font-bold"><Clock3 size={19} /> {adminView ? "All pricing searches" : "Your last 3 searches"}</h2><p className="mt-1 text-xs text-[var(--ink-muted)]">{adminView ? "Administrator view includes searches from every registered user." : "Your most recent pricing requests are saved here."}</p></div>{history.length ? <div className="divide-y divide-[var(--line)]">{history.map((item) => <div key={item.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="font-bold">{item.title}</span><span className="rounded bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] font-bold uppercase">{item.status}</span>{item.confidence ? <span className="text-xs text-[var(--ink-muted)]">{item.confidence} confidence</span> : null}</div><div className="mt-1 text-sm text-[var(--ink-muted)]">{item.brand} {item.itemModel}{item.scale ? ` · ${item.scale}` : ""}{item.versionModelYear ? ` · ${item.versionModelYear}` : ""}{item.cellCount ? ` · ${item.cellCount}S` : ""} · {item.condition}</div><div className="mt-1 text-xs text-[var(--ink-muted)]">{adminView ? `${item.userName} · ${item.userEmail} · ` : ""}{new Date(item.createdAt).toLocaleString()} · {item.provider ?? "pending"}</div></div><div className="text-left md:text-right"><div className="text-xs text-[var(--ink-muted)]">Recommended</div><div className="mono font-bold">{item.recommendedCents && item.recommendedCents > 0 ? formatMoney(item.recommendedCents, item.currency) : "Unavailable"}</div></div></div>)}</div> : <div className="p-4 text-sm text-[var(--ink-muted)]">No pricing searches yet.</div>}</Card>;
}

function Price({ label, value, currency }: { label: string; value: number; currency: string }) {
  return <div className="rounded-md border border-[var(--line)] bg-[var(--background)] p-4"><div className="flex items-center gap-2 text-sm text-[var(--ink-muted)]"><Tag size={15} /> {label}</div><div className="mono mt-2 text-2xl font-bold">{value > 0 ? formatMoney(value, currency) : "Unavailable"}</div></div>;
}

function confidenceClass(confidence: ResearchResult["confidence"]) {
  if (confidence === "high") return "bg-emerald-100 text-emerald-800";
  if (confidence === "medium") return "bg-blue-100 text-blue-800";
  if (confidence === "low") return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}
