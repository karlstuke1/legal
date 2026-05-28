export const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings";
export const DEFAULT_HIGH_QUALITY_MODEL = "openai/gpt-5.5";
export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: ChatRole | string;
  content: unknown;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

export interface OpenRouterChatOptions {
  apiKey?: string;
  model?: string;
  messages: ChatMessage[];
  stream?: boolean;
  streamOptions?: Record<string, unknown>;
  maxTokens?: number;
  maxCompletionTokens?: number;
  tools?: unknown[];
  toolChoice?: unknown;
  responseFormat?: unknown;
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh";
  includeReasoning?: boolean;
  requireParameters?: boolean;
  temperature?: number;
  provider?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface OpenRouterEmbeddingOptions {
  apiKey?: string;
  model?: string;
  input: string | string[];
  dimensions?: number;
  signal?: AbortSignal;
}

export interface StrictJsonSchema {
  type: "json_schema";
  json_schema: {
    name: string;
    strict: true;
    schema: Record<string, unknown>;
  };
}

function getEnv(name: string): string | undefined {
  return (globalThis as any).Deno?.env?.get?.(name);
}

export function getHighQualityModel(): string {
  return getEnv("OPENROUTER_MODEL_HIGH_QUALITY") || DEFAULT_HIGH_QUALITY_MODEL;
}

export function getEmbeddingModel(): string {
  return getEnv("OPENROUTER_EMBEDDING_MODEL") || DEFAULT_EMBEDDING_MODEL;
}

export function getOpenRouterApiKey(): string | undefined {
  return getEnv("OPENROUTER_API_KEY");
}

export function strictJsonSchema(name: string, schema: Record<string, unknown>): StrictJsonSchema {
  return {
    type: "json_schema",
    json_schema: {
      name,
      strict: true,
      schema,
    },
  };
}

export function buildOpenRouterChatBody(options: OpenRouterChatOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: options.model || getHighQualityModel(),
    messages: options.messages,
    reasoning: {
      effort: options.reasoningEffort || "high",
      exclude: options.includeReasoning !== true,
    },
  };

  if (options.stream !== undefined) body.stream = options.stream;
  if (options.streamOptions) body.stream_options = options.streamOptions;
  if (options.maxTokens) body.max_tokens = options.maxTokens;
  if (options.maxCompletionTokens) body.max_completion_tokens = options.maxCompletionTokens;
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.tools) body.tools = options.tools;
  if (options.toolChoice !== undefined) body.tool_choice = options.toolChoice;
  if (options.responseFormat) body.response_format = options.responseFormat;

  const shouldRequireParameters = options.requireParameters
    ?? Boolean(options.tools || options.toolChoice || options.responseFormat || options.reasoningEffort);
  const provider = { ...(options.provider || {}) };
  if (shouldRequireParameters) provider.require_parameters = true;
  if (Object.keys(provider).length > 0) body.provider = provider;

  return body;
}

export async function openRouterChatCompletion(options: OpenRouterChatOptions): Promise<Response> {
  const apiKey = options.apiKey || getOpenRouterApiKey();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  return fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildOpenRouterChatBody(options)),
    signal: options.signal,
  });
}

export async function openRouterEmbedding(options: OpenRouterEmbeddingOptions): Promise<Response> {
  const apiKey = options.apiKey || getOpenRouterApiKey();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  const body: Record<string, unknown> = {
    model: options.model || getEmbeddingModel(),
    input: options.input,
  };
  if (options.dimensions) body.dimensions = options.dimensions;

  return fetch(OPENROUTER_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });
}

export function extractMessageContent(data: any): string {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part === "string" ? part : part?.text || "")
      .join("");
  }
  return "";
}

export function extractFirstToolArguments(data: any): Record<string, unknown> | null {
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args || typeof args !== "string") return null;
  return JSON.parse(args);
}

export function parseJsonObject(content: string): any {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim()
    .replace(/,\s*([\]}])/g, "$1");
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch?.[0] || cleaned);
}

export function parseJsonArray(content: string): any[] {
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim()
    .replace(/,\s*([\]}])/g, "$1");
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  const parsed = JSON.parse(jsonMatch?.[0] || cleaned);
  return Array.isArray(parsed) ? parsed : [];
}
