/**
 * LLM Clients for Natural Language Command Processing
 *
 * Supports Anthropic, Gemini, Ollama, and Mock providers with
 * retry logic, backoff, and fallback model chains.
 */
import { z } from "zod";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface LlmInput {
  system: string;
  user: string;
}

export interface LlmOutput {
  text: string;
  provider: string;
  model: string;
  latencyMs: number;
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function nowMs(): number {
  return performance.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

interface FetchWithRetryOptions {
  retryOnStatuses: number[];
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

function jitteredBackoffMs(options: {
  attempt: number;
  baseDelayMs: number;
  maxDelayMs: number;
}): number {
  const exp = options.baseDelayMs * 2 ** options.attempt;
  const capped = Math.min(options.maxDelayMs, exp);
  const jitter = 0.2 * capped * (Math.random() - 0.5) * 2;
  return Math.max(0, capped + jitter);
}

async function readResponseText(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return JSON.stringify(await response.json());
  }
  return await response.text();
}

class LlmHttpError extends Error {
  status: number;
  statusText: string;
  body: string;

  constructor(options: {
    provider: string;
    status: number;
    statusText: string;
    body: string;
  }) {
    super(
      `${options.provider} HTTP ${options.status} ${options.statusText}: ${options.body}`
    );
    this.status = options.status;
    this.statusText = options.statusText;
    this.body = options.body;
  }
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchWithRetryOptions
): Promise<Response> {
  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    const response = await fetch(url, init);
    if (response.ok) return response;

    const shouldRetry =
      options.retryOnStatuses.includes(response.status) &&
      attempt < options.maxRetries;

    if (!shouldRetry) return response;

    const delayMs = jitteredBackoffMs({
      attempt,
      baseDelayMs: options.baseDelayMs,
      maxDelayMs: options.maxDelayMs,
    });
    await sleep(delayMs);
  }
  throw new Error("Unreachable");
}

// ─── Anthropic ──────────────────────────────────────────────────────────────

export class AnthropicLlmClient {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private retry: RetryConfig;

  constructor(options: {
    apiKey: string;
    model: string;
    baseUrl?: string;
  }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl ?? "https://api.anthropic.com";
    this.retry = {
      maxRetries: parseInt(process.env.LLM_RETRY_MAX ?? "5", 10),
      baseDelayMs: parseInt(process.env.LLM_RETRY_BASE_MS ?? "300", 10),
      maxDelayMs: parseInt(process.env.LLM_RETRY_MAX_MS ?? "5000", 10),
    };
  }

  async generateText(input: LlmInput): Promise<LlmOutput> {
    const start = nowMs();

    const response = await fetchWithRetry(
      `${this.baseUrl}/v1/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1024,
          system: input.system,
          messages: [{ role: "user", content: input.user }],
        }),
      },
      {
        retryOnStatuses: [429, 500, 502, 503, 529],
        maxRetries: this.retry.maxRetries,
        baseDelayMs: this.retry.baseDelayMs,
        maxDelayMs: this.retry.maxDelayMs,
      }
    );

    if (!response.ok) {
      const body = await readResponseText(response);
      throw new LlmHttpError({
        provider: "anthropic",
        status: response.status,
        statusText: response.statusText,
        body,
      });
    }

    const data = z
      .object({
        content: z.array(
          z.object({
            type: z.literal("text"),
            text: z.string(),
          })
        ),
        model: z.string().optional(),
      })
      .passthrough()
      .parse(await response.json());

    const text = data.content.map((c) => c.text).join("\n");

    return {
      text,
      provider: "anthropic",
      model: data.model ?? this.model,
      latencyMs: nowMs() - start,
    };
  }
}

// ─── Gemini ─────────────────────────────────────────────────────────────────

export class GeminiLlmClient {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private retry: RetryConfig;

  constructor(options: {
    apiKey: string;
    model: string;
    baseUrl?: string;
  }) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl ?? "https://generativelanguage.googleapis.com";
    this.retry = {
      maxRetries: parseInt(process.env.LLM_RETRY_MAX ?? "5", 10),
      baseDelayMs: parseInt(process.env.LLM_RETRY_BASE_MS ?? "300", 10),
      maxDelayMs: parseInt(process.env.LLM_RETRY_MAX_MS ?? "5000", 10),
    };
  }

  async generateText(input: LlmInput): Promise<LlmOutput> {
    const start = nowMs();
    const url = `${this.baseUrl}/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: "user", parts: [{ text: input.user }] }],
          generationConfig: { maxOutputTokens: 1024 },
        }),
      },
      {
        retryOnStatuses: [429, 500, 502, 503],
        maxRetries: this.retry.maxRetries,
        baseDelayMs: this.retry.baseDelayMs,
        maxDelayMs: this.retry.maxDelayMs,
      }
    );

    if (!response.ok) {
      const body = await readResponseText(response);
      throw new LlmHttpError({
        provider: "gemini",
        status: response.status,
        statusText: response.statusText,
        body,
      });
    }

    const data = z
      .object({
        candidates: z.array(
          z.object({
            content: z.object({
              parts: z
                .array(z.object({ text: z.string().optional() }))
                .optional(),
            }),
          })
        ),
      })
      .passthrough()
      .parse(await response.json());

    const text =
      data.candidates[0]?.content.parts
        ?.map((p) => p.text ?? "")
        .join("") ?? "";

    return {
      text,
      provider: "gemini",
      model: this.model,
      latencyMs: nowMs() - start,
    };
  }
}

// ─── Gemini Fallback ────────────────────────────────────────────────────────

export class GeminiFallbackLlmClient {
  private apiKey: string;
  private models: string[];
  private baseUrl?: string;

  constructor(options: {
    apiKey: string;
    models: string[];
    baseUrl?: string;
  }) {
    this.apiKey = options.apiKey;
    this.models = options.models;
    this.baseUrl = options.baseUrl;
  }

  async generateText(input: LlmInput): Promise<LlmOutput> {
    let lastError: unknown = null;
    for (const model of this.models) {
      try {
        const client = new GeminiLlmClient({
          apiKey: this.apiKey,
          model,
          baseUrl: this.baseUrl,
        });
        return await client.generateText(input);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

// ─── Ollama ─────────────────────────────────────────────────────────────────

export class OllamaLlmClient {
  private model: string;
  private baseUrl: string;
  private retry: RetryConfig;

  constructor(options: { model: string; baseUrl?: string }) {
    this.model = options.model;
    this.baseUrl = options.baseUrl ?? "http://127.0.0.1:11434";
    this.retry = {
      maxRetries: parseInt(process.env.LLM_RETRY_MAX ?? "3", 10),
      baseDelayMs: parseInt(process.env.LLM_RETRY_BASE_MS ?? "150", 10),
      maxDelayMs: parseInt(process.env.LLM_RETRY_MAX_MS ?? "1500", 10),
    };
  }

  async generateText(input: LlmInput): Promise<LlmOutput> {
    const start = nowMs();
    const baseUrl = this.baseUrl.replace(/\/+$/, "");
    const url = `${baseUrl}/api/chat`;

    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user },
          ],
        }),
      },
      {
        retryOnStatuses: [429, 500, 502, 503],
        maxRetries: this.retry.maxRetries,
        baseDelayMs: this.retry.baseDelayMs,
        maxDelayMs: this.retry.maxDelayMs,
      }
    );

    if (!response.ok) {
      const body = await readResponseText(response);
      throw new LlmHttpError({
        provider: "ollama",
        status: response.status,
        statusText: response.statusText,
        body,
      });
    }

    const data = z
      .object({
        model: z.string().optional(),
        message: z
          .object({
            content: z.string(),
          })
          .optional(),
        response: z.string().optional(),
      })
      .passthrough()
      .parse(await response.json());

    return {
      text: data.message?.content ?? data.response ?? "",
      provider: "ollama",
      model: data.model ?? this.model,
      latencyMs: nowMs() - start,
    };
  }
}

// ─── Ollama Fallback ────────────────────────────────────────────────────────

export class OllamaFallbackLlmClient {
  private models: string[];
  private baseUrl?: string;

  constructor(options: { models: string[]; baseUrl?: string }) {
    this.models = options.models;
    this.baseUrl = options.baseUrl;
  }

  async generateText(input: LlmInput): Promise<LlmOutput> {
    let lastError: unknown = null;
    for (const model of this.models) {
      try {
        const client = new OllamaLlmClient({
          model,
          baseUrl: this.baseUrl,
        });
        return await client.generateText(input);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}

// ─── Mock ───────────────────────────────────────────────────────────────────

export class MockLlmClient {
  private model: string;
  private responseText: string;

  constructor(options: { model?: string; responseText: string }) {
    this.model = options.model ?? "mock";
    this.responseText = options.responseText;
  }

  async generateText(): Promise<LlmOutput> {
    return {
      text: this.responseText,
      provider: "mock",
      model: this.model,
      latencyMs: 0,
    };
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createLlmClientFromEnv(): AnthropicLlmClient | GeminiLlmClient  | GeminiFallbackLlmClient | OllamaLlmClient | OllamaFallbackLlmClient | MockLlmClient {
  const provider = process.env.LLM_PROVIDER ?? "anthropic";

  if (provider === "ollama") {
    const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
    const explicitModel = process.env.OLLAMA_MODEL?.trim();
    const modelsFromList =
      process.env.OLLAMA_MODELS?.split(",")
        .map((m) => m.trim())
        .filter(Boolean) ?? [];
    const model =
      explicitModel && explicitModel.length > 0
        ? explicitModel
        : "gemma:2b";

    if (!explicitModel && modelsFromList.length > 0) {
      return new OllamaFallbackLlmClient({ models: modelsFromList, baseUrl });
    }
    if (model.includes(",")) {
      const models = model
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean);
      return new OllamaFallbackLlmClient({ models, baseUrl });
    }
    return new OllamaLlmClient({ model, baseUrl });
  }

  if (provider === "anthropic") {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Missing ANTHROPIC_API_KEY");
    }
    const model = process.env.ANTHROPIC_MODEL ?? "claude-3-opus-20240229";
    const baseUrl = process.env.ANTHROPIC_BASE_URL;
    return new AnthropicLlmClient({ apiKey, model, baseUrl });
  }

  if (provider === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY");
    }
    const modelsFromList =
      process.env.GEMINI_MODELS?.split(",")
        .map((m) => m.trim())
        .filter(Boolean) ?? [];
    const model = process.env.GEMINI_MODEL ?? "gemini-1.5-pro";
    const baseUrl = process.env.GEMINI_BASE_URL;

    if (modelsFromList.length > 0) {
      return new GeminiFallbackLlmClient({
        apiKey,
        models: modelsFromList,
        baseUrl,
      });
    }
    if (model.includes(",")) {
      const models = model
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean);
      return new GeminiFallbackLlmClient({ apiKey, models, baseUrl });
    }
    return new GeminiLlmClient({ apiKey, model, baseUrl });
  }

  const responseText =
    process.env.MOCK_LLM_RESPONSE ??
    JSON.stringify({ tool: "td_pane", args: {} });
  return new MockLlmClient({ responseText });
}
