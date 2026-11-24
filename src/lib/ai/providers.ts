export type AiProviderId = "mock" | "deepseek" | "groq" | "huggingface" | "gemini";

export interface AiCompletionRequest {
  feature: string;
  system: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  modelOverride?: string;
  providerOverride?: AiProviderId;
  webSearch?: {
    country?: string;
    includeDomains?: string[];
    excludeDomains?: string[];
  };
}

export interface AiCompletionResult {
  provider: AiProviderId;
  model: string;
  text: string;
}

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

const defaultRequestTimeoutMs = 15_000;

export async function completeAiText(request: AiCompletionRequest): Promise<AiCompletionResult> {
  const provider = request.providerOverride ?? providerId();

  if (provider === "gemini") {
    return completeWithGemini({
      model: request.modelOverride || process.env.GEMINI_MODEL || "gemini-3.8-flash",
      apiKey: process.env.GEMINI_API_KEY,
      request
    });
  }

  if (provider === "deepseek") {
    return completeWithOpenAiCompatibleApi({
      provider,
      model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      url: "https://api.deepseek.com/chat/completions",
      apiKey: process.env.DEEPSEEK_API_KEY,
      request
    });
  }

  if (provider === "groq") {
    return completeWithOpenAiCompatibleApi({
      provider,
      model: request.modelOverride || process.env.GROQ_MODEL || "openai/gpt-oss-120b",
      url: "https://api.groq.com/openai/v1/chat/completions",
      apiKey: process.env.GROQ_API_KEY,
      request
    });
  }

  if (provider === "huggingface") {
    return completeWithOpenAiCompatibleApi({
      provider,
      model: process.env.HUGGINGFACE_MODEL || "openai/gpt-oss-20b",
      url: "https://router.huggingface.co/v1/chat/completions",
      apiKey: process.env.HUGGINGFACE_API_KEY,
      request
    });
  }

  return {
    provider: "mock",
    model: "local-product-helper",
    text: mockCompletion(request)
  };
}

function providerId(): AiProviderId {
  if (process.env.AI_PROVIDER === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.AI_PROVIDER === "deepseek" && process.env.DEEPSEEK_API_KEY) return "deepseek";
  if (process.env.AI_PROVIDER === "groq" && process.env.GROQ_API_KEY) return "groq";
  if (process.env.AI_PROVIDER === "huggingface" && process.env.HUGGINGFACE_API_KEY) return "huggingface";
  return "mock";
}

async function completeWithGemini(options: {
  model: string;
  apiKey?: string;
  request: AiCompletionRequest;
}): Promise<AiCompletionResult> {
  if (!options.apiKey) {
    return { provider: "mock", model: "local-product-helper", text: mockCompletion(options.request) };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.request.timeoutMs ?? configuredTimeoutMs());
  let response: Response;
  try {
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": options.apiKey
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: options.request.system }] },
        contents: [{ role: "user", parts: [{ text: options.request.prompt }] }],
        ...(options.request.webSearch ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: {
          temperature: options.request.temperature ?? 0.3,
          maxOutputTokens: options.request.maxTokens ?? 700,
          thinkingConfig: { thinkingLevel: "low" }
        }
      }),
      signal: controller.signal
    });
  } catch {
    throw new Error("AI provider gemini request failed or timed out.");
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 500);
    throw new Error(`AI provider gemini returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  const payload = (await response.json()) as GeminiResponse;
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  return { provider: "gemini", model: options.model, text: text || "No recommendation returned." };
}

async function completeWithOpenAiCompatibleApi(options: {
  provider: AiProviderId;
  model: string;
  url: string;
  apiKey?: string;
  request: AiCompletionRequest;
}): Promise<AiCompletionResult> {
  if (!options.apiKey) {
    return {
      provider: "mock",
      model: "local-product-helper",
      text: mockCompletion(options.request)
    };
  }

  const controller = new AbortController();
  const timeoutMs = options.request.timeoutMs ?? configuredTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(options.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${options.apiKey}`
      },
      body: JSON.stringify({
        model: options.model,
        temperature: options.request.temperature ?? 0.3,
        max_tokens: options.request.maxTokens ?? 700,
        messages: [
          { role: "system", content: options.request.system },
          { role: "user", content: options.request.prompt }
        ],
        ...webSearchOptions(options.provider, options.model, options.request.webSearch)
      }),
      signal: controller.signal
    });
  } catch {
    throw new Error(`AI provider ${options.provider} request failed or timed out.`);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 500);
    throw new Error(`AI provider ${options.provider} returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  const payload = (await response.json()) as ChatResponse;
  return {
    provider: options.provider,
    model: options.model,
    text: payload.choices?.[0]?.message?.content?.trim() || "No recommendation returned."
  };
}

function webSearchOptions(
  provider: AiProviderId,
  model: string,
  settings: AiCompletionRequest["webSearch"]
) {
  if (!settings || provider !== "groq") return {};

  // Groq retired Compound on 2026-09-21. GPT-OSS models use its replacement
  // browser-search tool through the standard tools field.
  if (!model.startsWith("groq/compound")) {
    return {
      tool_choice: "required",
      tools: [{ type: "browser_search" }]
    };
  }

  return {
    compound_custom: { tools: { enabled_tools: ["web_search"] } },
    search_settings: {
      country: settings.country,
      include_domains: settings.includeDomains,
      exclude_domains: settings.excludeDomains
    }
  };
}

function configuredTimeoutMs() {
  const configured = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? defaultRequestTimeoutMs);
  return Number.isFinite(configured) ? Math.min(Math.max(configured, 1_000), 60_000) : defaultRequestTimeoutMs;
}

function mockCompletion(request: AiCompletionRequest) {
  if (request.feature === "agent" || request.feature === "agent-final") {
    return JSON.stringify({
      type: "final",
      answer: "The local AI fallback cannot choose live tools. The agent will use its deterministic marketplace planner for this run."
    });
  }

  if (request.feature === "pricing") {
    return [
      "Estimated market range: 8-12% below the clean retail benchmark.",
      "Confidence: medium, because exact sold-comparable data is not connected yet.",
      "Suggested action: start with a fair fixed price and allow offers for the first 72 hours."
    ].join("\n");
  }

  if (request.feature === "listing") {
    return [
      "Recommended title: include brand, model, condition, and the strongest included accessory.",
      "Description gaps: add proof of ownership, condition notes, tested date, and shipping constraints.",
      "Trust step: upload serial or authenticity proof to the private verification field before publishing."
    ].join("\n");
  }

  return "Recommendation prepared. Connect a provider key to replace this local fallback with model output.";
}
