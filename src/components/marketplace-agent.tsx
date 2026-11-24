"use client";

import { Bot, CheckCircle2, Loader2, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, Textarea } from "@/components/ui";
import type { AgentRunResult, AgentRunSummary, AgentStep } from "@/lib/ai/agent";

const examples = [
  "Find a beginner drone under $500 and inspect the best match.",
  "Review my current offers, bids, and watchlist activity.",
  "Find a used RC car and check whether its asking price is reasonable."
];

export function MarketplaceAgent({ initialRuns }: { initialRuns: AgentRunSummary[] }) {
  const [goal, setGoal] = useState(examples[0]);
  const [result, setResult] = useState<AgentRunResult | null>(null);
  const [runs, setRuns] = useState(initialRuns);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function runAgent() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/ai/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ goal })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "The agent could not complete this run.");
      const next = payload as AgentRunResult;
      setResult(next);
      if (next.jobId) {
        setRuns((current) => [{
          id: next.jobId!,
          goal: next.goal,
          status: next.status,
          provider: next.provider,
          model: next.model,
          answer: next.answer,
          stepCount: next.steps.length,
          createdAt: new Date().toISOString()
        }, ...current].slice(0, 8));
      }
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "The agent could not complete this run.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.55fr)]">
      <div className="grid gap-5">
        <Card className="p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--ink)] text-white"><Bot size={20} /></div>
            <div>
              <div className="font-bold">Give the agent an outcome</div>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">It will plan, select marketplace tools, inspect observations, and adapt before answering.</p>
            </div>
          </div>
          <Textarea value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={1200} className="min-h-32 w-full" />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[var(--ink-muted)]">{goal.length}/1200 · Read-only tools · Up to 6 planning turns</span>
            <Button variant="primary" onClick={runAgent} disabled={loading || goal.trim().length < 8}>
              {loading ? <><Loader2 size={16} className="animate-spin" /> Running agent...</> : <><Sparkles size={16} /> Run agent</>}
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {examples.map((example) => <button key={example} onClick={() => setGoal(example)} className="filter text-left">{example}</button>)}
          </div>
          {error ? <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-[var(--red)]">{error}</div> : null}
        </Card>

        {result ? (
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] p-5">
              <CheckCircle2 size={19} className="text-[var(--green)]" />
              <div className="font-bold">Agent outcome</div>
              <Badge tone="good">{result.steps.length} tool {result.steps.length === 1 ? "step" : "steps"}</Badge>
              <span className="ml-auto text-xs text-[var(--ink-muted)]">{result.provider} · {result.model}</span>
            </div>
            <div className="whitespace-pre-wrap p-5 text-sm leading-7">{result.answer}</div>
            <div className="border-t border-[var(--line)] bg-[var(--background)] p-5">
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-[var(--ink-muted)]">Plan · Act · Observe</div>
              <div className="grid gap-3">
                {result.steps.map((step) => <AgentStepView key={`${step.iteration}-${step.tool}`} step={step} />)}
              </div>
            </div>
          </Card>
        ) : null}
      </div>

      <aside className="grid content-start gap-5">
        <Card className="p-5">
          <div className="font-bold">Agent boundaries</div>
          <div className="mt-3 grid gap-3 text-sm text-[var(--ink-muted)]">
            <p>Searches active listings and components.</p>
            <p>Inspects listing details and persisted pricing guidance.</p>
            <p>Reads only your role-scoped marketplace activity.</p>
            <p>Bids, offers, messages, and moderation still require an explicit user action.</p>
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-3 font-bold">Recent agent runs</div>
          <div className="grid gap-3">
            {runs.length ? runs.map((run) => (
              <div key={run.id} className="rounded-md border border-[var(--line)] p-3">
                <div className="line-clamp-2 text-sm font-semibold">{run.goal}</div>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--ink-muted)]">
                  <Badge tone={run.status === "SUCCEEDED" ? "good" : run.status === "FAILED" ? "bad" : "warn"}>{run.status.toLowerCase()}</Badge>
                  <span>{run.stepCount} steps</span>
                  <span>·</span>
                  <span>{new Date(run.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            )) : <div className="text-sm text-[var(--ink-muted)]">No persisted agent runs yet.</div>}
          </div>
        </Card>
      </aside>
    </div>
  );
}

function AgentStepView({ step }: { step: AgentStep }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-md border border-[var(--line)] bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-full bg-[var(--ink)] text-[11px] font-bold text-white">{step.iteration}</span>
        <Search size={15} className="text-[var(--blue)]" />
        <span className="font-mono text-xs font-bold">{step.tool}</span>
      </div>
      <p className="mt-2 text-sm text-[var(--ink-muted)]">{step.reason}</p>
      <button className="mt-2 text-xs font-semibold text-[var(--accent-strong)]" onClick={() => setExpanded((value) => !value)}>
        {expanded ? "Hide observation" : "Show observation"}
      </button>
      {expanded ? <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-[var(--ink)] p-3 text-xs leading-5 text-white">{JSON.stringify(step.observation, null, 2)}</pre> : null}
    </div>
  );
}
