"use server";

import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { getSession } from "@/lib/auth/session";
import { chatCompletion, extractJsonObject, aiStatus } from "@/lib/ai/client";
import {
  buildCatalogueSnapshot,
  buildPublicHelpPrompt,
  buildSystemPrompt,
} from "@/lib/ai/context";
import {
  appendAssistantMessages,
  clearAssistantHistory,
  listAssistantHistory,
} from "@/lib/ai/store";

/**
 * AI features: release copy drafting and the admin assistant.
 *
 * These are plain async functions rather than AdminForm actions because the
 * callers are client components that need the returned draft immediately —
 * nothing here writes to the catalogue. Every draft lands in a form field for
 * a human to read and save; the AI never touches the database itself.
 *
 * Auth is checked with getSession() rather than requireEditor()/requireStaff()
 * because those redirect, and a redirect inside a fetch-called action surfaces
 * as a broken response instead of a message the UI can show.
 */

export type AiResult<T> =
  | ({ ok: true } & T)
  | { ok: false; message: string };

const MAX_FIELD = 4000;
const cap = (v: unknown, max = MAX_FIELD): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

async function requireStaffSession(): Promise<
  { session: NonNullable<Awaited<ReturnType<typeof getSession>>> } | { error: string }
> {
  const session = await getSession();
  if (!session) return { error: "Sign in again to use the assistant." };
  if (!session.isStaff) return { error: "The assistant is for staff accounts only." };
  return { session };
}

/* ------------------------------------------------------- release copy draft */

export type ReleaseCopyDraft = {
  description: string;
  artworkAlt: string;
};

export async function draftReleaseCopyAction(input: {
  title: string;
  releaseType: string;
  genre: string;
  subgenre?: string;
  language?: string;
  notes?: string;
}): Promise<AiResult<ReleaseCopyDraft>> {
  const auth = await requireStaffSession();
  if ("error" in auth) return { ok: false, message: auth.error };
  if (!auth.session.canEditContent) {
    return { ok: false, message: "Your role can read the assistant but not draft catalogue copy." };
  }
  if (!aiStatus().configured) {
    return { ok: false, message: aiStatus().missing ?? "The AI assistant is not configured." };
  }

  const title = cap(input.title, 200);
  if (title === "") return { ok: false, message: "Give the release a title first — the draft is written from it." };

  const notes = cap(input.notes, 1000);
  const prompt = [
    "Write release copy for a music distributor and the artist's own site.",
    `Release title: ${title}`,
    `Type: ${cap(input.releaseType, 40) || "single"}`,
    `Primary genre: ${cap(input.genre, 80) || "unspecified"}`,
    input.subgenre ? `Sub-genre: ${cap(input.subgenre, 80)}` : null,
    input.language ? `Language: ${cap(input.language, 40)}` : null,
    notes ? `Notes from the admin: ${notes}` : null,
    "",
    "Reply with ONE JSON object and nothing else, with exactly these keys:",
    '- "description": 2-4 sentences for the release page and EPK. Specific to this record, no clichés like "touching masterpiece", no invented facts (no chart positions, awards, features or dates).',
    '- "artwork_alt": one short sentence describing cover art for screen readers, e.g. "Album cover for X: ...". If no artwork details are known, describe it generically without inventing imagery.',
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await chatCompletion(
      [
        {
          role: "system",
          content:
            "You write concise, honest music-marketing copy for an independent African artist. You never invent facts. You reply only with the JSON object requested.",
        },
        { role: "user", content: prompt },
      ],
      { json: true, maxTokens: 700 },
    );
    const parsed = extractJsonObject(raw) as Record<string, unknown> | null;
    const description = cap(parsed?.description, 2000);
    const artworkAlt = cap(parsed?.artwork_alt, 300);
    if (!description) {
      return {
        ok: false,
        message: "The model's reply could not be read as the requested fields. Try again, or write the copy yourself.",
      };
    }
    return { ok: true, description, artworkAlt };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "The AI provider could not be reached.",
    };
  }
}

/* ------------------------------------------------------------- SEO draft */

export type SeoDraft = { seoTitle: string; seoDescription: string };

function clampTitle(t: string): string {
  if (t.length <= 68) return t;
  const cut = t.slice(0, 68);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 30 ? cut.slice(0, lastSpace) : cut).trim();
}

export async function draftReleaseSeoAction(input: {
  title: string;
  releaseType: string;
  genre: string;
  description?: string;
  slug?: string;
}): Promise<AiResult<SeoDraft>> {
  const auth = await requireStaffSession();
  if ("error" in auth) return { ok: false, message: auth.error };
  if (!auth.session.canEditContent) {
    return { ok: false, message: "Your role can read the assistant but not draft catalogue copy." };
  }
  if (!aiStatus().configured) {
    return { ok: false, message: aiStatus().missing ?? "The AI assistant is not configured." };
  }

  const title = cap(input.title, 200);
  if (title === "") return { ok: false, message: "The release needs a title before search copy can be drafted." };

  const prompt = [
    "Write search-result copy for this release's public page.",
    `Title: ${title}`,
    `Type: ${cap(input.releaseType, 40) || "single"}`,
    `Genre: ${cap(input.genre, 80) || "unspecified"}`,
    input.description ? `Release description: ${cap(input.description, 1500)}` : null,
    input.slug ? `Page path: /music/${cap(input.slug, 120)}` : null,
    "",
    "Reply with ONE JSON object and nothing else, with exactly these keys:",
    '- "seo_title": under 60 characters, no brand suffix (the site appends "| REX KENNY" itself).',
    '- "seo_description": 120-160 characters, written for the person deciding whether to click. No invented facts.',
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await chatCompletion(
      [
        {
          role: "system",
          content:
            "You write search snippets for a musician's official site. Accurate, specific, no hype clichés. Reply only with the JSON object requested.",
        },
        { role: "user", content: prompt },
      ],
      { json: true, maxTokens: 400 },
    );
    const parsed = extractJsonObject(raw) as Record<string, unknown> | null;
    let seoTitle = clampTitle(cap(parsed?.seo_title, 200));
    let seoDescription = cap(parsed?.seo_description, 300);
    if (seoDescription.length > 300) {
      const cut = seoDescription.slice(0, 300);
      const lastSpace = cut.lastIndexOf(" ");
      seoDescription = (lastSpace > 200 ? cut.slice(0, lastSpace) : cut).trim();
    }
    if (!seoTitle || !seoDescription) {
      return {
        ok: false,
        message: "The model's reply could not be read as the requested fields. Try again, or write the tags yourself.",
      };
    }
    return { ok: true, seoTitle, seoDescription };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "The AI provider could not be reached.",
    };
  }
}

/* ------------------------------------------------------------- assistant */

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type AssistantReply = AiResult<{
  reply: string;
  /** persistent = remembered in the database; session = this visit only; off = not stored. */
  memory: "persistent" | "session" | "off";
}>;

const HISTORY_TURNS = 30;

type StaffSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

async function runStaffChat(
  session: StaffSession,
  text: string,
  sessionHistory: ChatTurn[],
): Promise<AssistantReply> {
  // Persistent memory wins when the table is there; the client-supplied tail
  // keeps the conversation coherent for this visit when it is not. Client
  // history is capped and treated as untrusted context, never as fact.
  const stored = await listAssistantHistory(session.userId, HISTORY_TURNS);
  let history: ChatTurn[];
  let memory: "persistent" | "session" | "off";
  if (stored.ok) {
    history = stored.messages.map((m) => ({ role: m.role, content: m.content }));
    memory = "persistent";
  } else {
    history = sessionHistory
      .slice(-HISTORY_TURNS)
      .map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: cap(m.content, 4000),
      }))
      .filter((m) => m.content !== "");
    memory = stored.offline ? "off" : "session";
  }

  const snapshot = await buildCatalogueSnapshot();
  const messages = [
    { role: "system" as const, content: buildSystemPrompt(snapshot) },
    ...history,
    { role: "user" as const, content: text },
  ];

  let reply: string;
  try {
    reply = await chatCompletion(messages, { maxTokens: 1200 });
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "The AI provider could not be reached.",
    };
  }

  if (memory === "persistent") {
    const saved = await appendAssistantMessages(session.userId, [
      { role: "user", content: text },
      { role: "assistant", content: reply },
    ]);
    if (!saved) memory = "session";
  }

  return { ok: true, reply, memory };
}

export async function sendAssistantMessageAction(
  message: string,
  sessionHistory: ChatTurn[] = [],
): Promise<AssistantReply> {
  const auth = await requireStaffSession();
  if ("error" in auth) return { ok: false, message: auth.error };
  if (!aiStatus().configured) {
    return { ok: false, message: aiStatus().missing ?? "The AI assistant is not configured." };
  }
  const text = cap(message, 2000);
  if (text === "") return { ok: false, message: "Type a question first." };
  return runStaffChat(auth.session, text, sessionHistory);
}

/* ------------------------------------------------- floating site assistant */

export type WidgetReply = AiResult<{
  reply: string;
  mode: "staff" | "public";
  memory: "persistent" | "session" | "off" | "none";
}>;

/**
 * Best-effort throttle for the anonymous helper: every visitor shares the
 * site's AI budget, so public messages are capped per client address. The
 * counter lives in this process's memory — it resets on deploy and does not
 * span instances, which is why it is a courtesy limit, not a security wall.
 * The real walls are the short answers, the capped history and the prompt
 * that knows nothing about the dashboard.
 */
const publicHits = new Map<string, number[]>();
const PUBLIC_LIMIT = 30;
const PUBLIC_WINDOW_MS = 60 * 60 * 1000;

async function publicAllowed(): Promise<boolean> {
  try {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      "unknown";
    const key = createHash("sha256")
      .update(`${ip}:${process.env.IP_SALT ?? "rex-kenny"}`)
      .digest("hex")
      .slice(0, 24);
    const now = Date.now();
    const hits = (publicHits.get(key) ?? []).filter((t) => now - t < PUBLIC_WINDOW_MS);
    if (hits.length >= PUBLIC_LIMIT) {
      publicHits.set(key, hits);
      return false;
    }
    hits.push(now);
    publicHits.set(key, hits);
    return true;
  } catch {
    return true;
  }
}

/**
 * One entry point for the floating widget on every page. Staff get the full
 * assistant with persistent memory; everyone else gets the public site helper,
 * which answers from public knowledge only, stores nothing, and is rate
 * limited per address.
 */
export async function sendWidgetMessageAction(
  message: string,
  sessionHistory: ChatTurn[] = [],
): Promise<WidgetReply> {
  if (!aiStatus().configured) {
    return { ok: false, message: aiStatus().missing ?? "The assistant is not configured." };
  }
  const session = await getSession();
  const text = cap(message, session?.isStaff ? 2000 : 1000);
  if (text === "") return { ok: false, message: "Type a question first." };

  if (session?.isStaff) {
    const r = await runStaffChat(session, text, sessionHistory);
    if (!r.ok) return r;
    return { ok: true, reply: r.reply, mode: "staff", memory: r.memory };
  }

  if (!(await publicAllowed())) {
    return {
      ok: false,
      message: "That is a lot of questions — please try again in a little while, or use /contact to reach the team directly.",
    };
  }

  const history = sessionHistory
    .slice(-HISTORY_TURNS)
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: cap(m.content, 2000),
    }))
    .filter((m) => m.content !== "");

  try {
    const reply = await chatCompletion(
      [
        { role: "system" as const, content: buildPublicHelpPrompt() },
        ...history,
        { role: "user" as const, content: text },
      ],
      { maxTokens: 600 },
    );
    return { ok: true, reply, mode: "public", memory: "none" };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "The assistant could not be reached.",
    };
  }
}

/** Loads the staff thread when the widget first opens; public visitors get nothing stored. */
export async function loadWidgetThreadAction(): Promise<{
  ok: boolean;
  mode: "staff" | "public";
  messages: ChatTurn[];
  memory: "persistent" | "session" | "off" | "none";
}> {
  const session = await getSession();
  if (!session?.isStaff) {
    return { ok: true, mode: "public", messages: [], memory: "none" };
  }
  const stored = await listAssistantHistory(session.userId, HISTORY_TURNS);
  if (stored.ok) {
    return {
      ok: true,
      mode: "staff",
      messages: stored.messages.map((m) => ({ role: m.role, content: m.content })),
      memory: "persistent",
    };
  }
  return {
    ok: true,
    mode: "staff",
    messages: [],
    memory: stored.offline ? "off" : "session",
  };
}

export async function clearAssistantHistoryAction(): Promise<AiResult<Record<string, never>>> {
  const auth = await requireStaffSession();
  if ("error" in auth) return { ok: false, message: auth.error };
  const cleared = await clearAssistantHistory(auth.session.userId);
  if (!cleared) {
    return {
      ok: false,
      message:
        "The conversation could not be cleared — the messages table is missing or unreachable. Apply migration 0012.",
    };
  }
  return { ok: true };
}
