"use client";

import { AlertCircle, CheckCircle2, FileSpreadsheet, ImageIcon, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";

type ImportResult = {
  source: string;
  row: number;
  title: string;
  status: "ready" | "invalid" | "created" | "failed";
  errors: string[];
  images: string[];
  listingId?: string;
  slug?: string;
};

type ImportResponse = {
  mode: "preview" | "commit";
  totals: { records: number; ready: number; invalid: number; created: number; failed: number };
  results: ImportResult[];
};

const columns = [
  "title", "description", "category", "condition", "listingType", "price", "reservePrice",
  "buyNowPrice", "location", "brand", "model", "images"
];

export function AdminBulkUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [response, setResponse] = useState<ImportResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);

  async function submit(mode: "preview" | "commit") {
    if (files.length === 0) {
      setError("Select an .xlsx or PDF source file first.");
      return;
    }
    setBusy(mode);
    setError("");
    try {
      const body = new FormData();
      body.set("mode", mode);
      files.forEach((file) => body.append("files", file));
      const request = await fetch("/api/admin/bulk-upload", { method: "POST", body });
      const payload = await request.json() as ImportResponse & { error?: string };
      if (!request.ok) throw new Error(payload.error || "Bulk upload failed.");
      setResponse(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Bulk upload failed.");
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setFiles([]);
    setResponse(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  }

  const sourceCount = files.filter((file) => /\.(?:xlsx|pdf)$/i.test(file.name)).length;
  const imageCount = files.length - sourceCount;
  const canCommit = response?.mode === "preview" && response.totals.ready > 0;

  return (
    <div className="grid gap-5">
      <Card className="p-5">
        <div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <div className="flex items-center gap-2 font-bold"><Upload size={18} /> Select import files</div>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Up to 31 files and 50 MB combined. Source files may be `.xlsx` or `.pdf`; media may be JPEG, PNG, or WebP.
            </p>
            <label className="mt-4 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--line-2)] bg-[var(--background)] p-5 text-center hover:border-[var(--ink-muted)]">
              <Upload size={28} className="text-[var(--ink-muted)]" />
              <span className="mt-2 font-semibold">Choose Excel, PDF, and image files</span>
              <span className="mt-1 text-xs text-[var(--ink-muted)]">You can select all related files together</span>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".xlsx,.pdf,.jpg,.jpeg,.png,.webp,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => {
                  setFiles(Array.from(event.target.files ?? []));
                  setResponse(null);
                  setError("");
                }}
              />
            </label>
            {files.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <Badge tone="info"><FileSpreadsheet size={12} /> {sourceCount} source file{sourceCount === 1 ? "" : "s"}</Badge>
                <Badge tone="neutral"><ImageIcon size={12} /> {imageCount} image{imageCount === 1 ? "" : "s"}</Badge>
                <span className="text-[var(--ink-muted)]">{formatBytes(files.reduce((sum, file) => sum + file.size, 0))}</span>
                <button type="button" onClick={reset} className="font-semibold text-[var(--red)] hover:underline">Clear</button>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4 text-sm">
            <h2 className="font-bold">Input format</h2>
            <p className="mt-2 text-xs leading-5 text-[var(--ink-muted)]">
              Excel: use the first row as column headers. Required values are title, description, category, condition,
              listingType, price, location, brand, and model. Add custom fields as <code>attribute.fieldName</code>.
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {columns.map((column) => <code key={column} className="rounded bg-white px-1.5 py-0.5 text-[11px]">{column}</code>)}
            </div>
            <p className="mt-3 text-xs leading-5 text-[var(--ink-muted)]">
              PDF: use one <code>Field: value</code> per line and separate records with <code>---</code>. In either format,
              list uploaded media filenames in <code>images</code>, separated by commas or semicolons.
            </p>
          </div>
        </div>

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-[var(--red)]">
            <AlertCircle size={17} className="mt-0.5 shrink-0" /> {error}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="primary" disabled={busy !== null || files.length === 0} onClick={() => submit("preview")}>
            {busy === "preview" ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
            Validate and preview
          </Button>
          {canCommit ? (
            <Button type="button" disabled={busy !== null} onClick={() => submit("commit")}>
              {busy === "commit" ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              Import {response.totals.ready} valid listing{response.totals.ready === 1 ? "" : "s"}
            </Button>
          ) : null}
        </div>
      </Card>

      {response ? <Results response={response} /> : null}
    </div>
  );
}

function Results({ response }: { response: ImportResponse }) {
  const completed = response.mode === "commit";
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] p-4">
        <div>
          <h2 className="font-bold">{completed ? "Import results" : "Validation preview"}</h2>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            {response.totals.records} records · {response.totals.invalid} invalid
            {completed ? ` · ${response.totals.created} created · ${response.totals.failed} failed` : ` · ${response.totals.ready} ready`}
          </p>
        </div>
        <Badge tone={completed && response.totals.created > 0 ? "good" : response.totals.invalid > 0 ? "warn" : "good"}>
          {completed ? `${response.totals.created} submitted for review` : `${response.totals.ready} ready`}
        </Badge>
      </div>
      <div className="divide-y divide-[var(--line)]">
        {response.results.map((result, index) => (
          <div key={`${result.source}-${result.row}-${index}`} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{result.title}</span>
                <ResultBadge status={result.status} />
              </div>
              <div className="mt-1 text-xs text-[var(--ink-muted)]">{result.source} · row/record {result.row}</div>
              {result.images.length > 0 ? <div className="mt-1 text-xs text-[var(--ink-muted)]">Media: {result.images.join(", ")}</div> : null}
              {result.errors.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--red)]">
                  {result.errors.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : null}
            </div>
            {result.slug ? <a className="text-xs font-semibold text-[var(--blue)] hover:underline" href={`/listings/${result.slug}`}>Open listing</a> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

function ResultBadge({ status }: { status: ImportResult["status"] }) {
  const tone = status === "created" || status === "ready" ? "good" : status === "invalid" ? "warn" : "bad";
  const label = status === "created" ? "Pending review" : status;
  return <Badge tone={tone}>{label}</Badge>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
