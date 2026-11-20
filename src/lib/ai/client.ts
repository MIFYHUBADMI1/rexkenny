import "server-only";
import { env, isAiConfigured } from "@/lib/config";

/**
 * The one place this site talks to a model. Everything above it — copy
 * drafting, the admin assistant — goes through chatCompletion(), so a provider
 * change is a config change, not a refactor.
 *
 * Providers fall into three wire formats:
 *   - OpenAI-compatible chat completions: openai, openrouter, groq, together,
 *     mistral, deepseek, and anything reached through AI_BASE_URL ("custom").
 *   - Anthropic messages API.
 *   - Google Gemini generateContent API.
 *
 * The API key never leaves the server: this module is server-only and every
 * caller is a server action that has already checked the caller's role.
 */

export type ChatRole = "system" | "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };

export type AiStatus = {
  configured: boolean;
  provider: string;
  model: string | null;
  /** What is still missing, in words the admin can act on. */
  missing: string | null;
};

export function aiStatus(): AiStatus {
  const provider = env.aiProvider ?? "openai";
  if (isAiConfigured) {
    return { configured: true, provider, model: env.aiModel ?? null, missing: null };
  }
  const missing = !env.aiApiKey
    ? "AI_API_KEY"
    : !env.aiModel
      ? "AI_MODEL"
      : null;
  return {
    configured: false,
    provider,
    model: env.aiModel ?? null,
    missing: missing
      ? `Set ${missing} in the server environment.`
      : "Set AI_API_KEY and AI_MODEL in the server environment.",
  };
}

const OPENAI_COMPATIBLE: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  together: "https://api.together.xyz/v1",
  mistral: "https://api.mistral.ai/v1",
  deepseek: "https://api.deepseek.com/v1",
};

const TIMEOUT_MS = 45_000;

function providerError(status: number, body: string): Error {
  let detail = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string } | string;
      message?: string;
    };
    const msg =
      typeof parsed.error === "string"
        ? parsed.error
        : parsed.error?.message ?? parsed.message;
    if (msg) detail = msg;
  } catch {
    /* keep the raw slice */
  }
  return new Error(`The AI provider refused the request (${status}): ${detail}`);
}

async function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw providerError(res.status, text);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("The AI provider returned a response that was not JSON.");
  }
}

async function openAiCompatible(
  baseUrl: string,
  messages: ChatMessage[],
  jsonMode: boolean,
  maxTokens: number,
): Promise<string> {
  const data = (await postJson(
    `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    { Authorization: `Bearer ${env.aiApiKey}` },
    {
      model: env.aiModel,
      messages,
      temperature: 0.7,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    },
  )) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("The AI provider returned an empty answer.");
  }
  return content;
}

async function anthropic(
  messages: ChatMessage[],
  jsonMode: boolean,
  maxTokens: number,
): Promise<string> {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const turns = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));
  const data = (await postJson(
    "https://api.anthropic.com/v1/messages",
    {
      "x-api-key": env.aiApiKey ?? "",
      "anthropic-version": "2023-06-01",
    },
    {
      model: env.aiModel,
      max_tokens: maxTokens,
      system: system + (jsonMode ? "\n\nReply with a single JSON object and nothing else." : ""),
      messages: turns,
    },
  )) as { content?: { type: string; text?: string }[] };
  const text = data.content?.find((c) => c.type === "text")?.text;
  if (!text) throw new Error("The AI provider returned an empty answer.");
  return text;
}

async function gemini(
  messages: ChatMessage[],
  jsonMode: boolean,
  maxTokens: number,
): Promise<string> {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
  const data = (await postJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      env.aiModel ?? "",
    )}:generateContent?key=${encodeURIComponent(env.aiApiKey ?? "")}`,
    {},
    {
      ...(system
        ? {
            system_instruction: {
              parts: [{ text: system + (jsonMode ? "\n\nReply with a single JSON object and nothing else." : "") }],
            },
          }
        : {}),
      contents,
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.7,
        ...(jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    },
  )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("The AI provider returned an empty answer.");
  return text;
}

/**
 * Sends one chat request and returns the assistant's text. Throws an Error
 * with a readable message when the provider refuses or cannot be reached;
 * callers surface that message verbatim rather than inventing a fallback.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: { json?: boolean; maxTokens?: number } = {},
): Promise<string> {
  if (!isAiConfigured) {
    throw new Error(aiStatus().missing ?? "The AI assistant is not configured.");
  }
  const jsonMode = options.json === true;
  const maxTokens = options.maxTokens ?? (jsonMode ? 1200 : 1500);
  const provider = env.aiProvider ?? "openai";

  if (provider === "anthropic") return anthropic(messages, jsonMode, maxTokens);
  if (provider === "gemini") return gemini(messages, jsonMode, maxTokens);

  const baseUrl =
    provider === "custom" || !(provider in OPENAI_COMPATIBLE)
      ? env.aiBaseUrl
      : OPENAI_COMPATIBLE[provider];
  if (!baseUrl) {
    throw new Error(
      `AI_PROVIDER "${provider}" needs AI_BASE_URL pointing at an OpenAI-compatible endpoint.`,
    );
  }
  return openAiCompatible(baseUrl, messages, jsonMode, maxTokens);
}

/**
 * Models asked for JSON still wrap it in prose or code fences often enough
 * that callers should not trust the first brace-naive parse. This finds the
 * outermost JSON object in the reply.
 */
export function extractJsonObject(text: string): unknown | null {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}
