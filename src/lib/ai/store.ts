import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Persistent memory for the admin assistant. One row per message, owned by the
 * staff account that sent or received it — the table's RLS policies (0012)
 * scope every read and write to auth.uid(), so this file never has to filter
 * by user itself, but it does anyway as a second check.
 *
 * When the table is missing (migration not applied yet) callers degrade to a
 * session-only conversation instead of failing: the assistant still answers,
 * it just does not remember across visits, and the UI says so.
 */

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

const MISSING_TABLE = /ai_chat_messages|does not exist|PGRST205|42P01/i;

export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return MISSING_TABLE.test(`${error.code ?? ""} ${error.message ?? ""}`);
}

export async function listAssistantHistory(
  userId: string,
  limit = 60,
): Promise<{ ok: true; messages: StoredMessage[] } | { ok: false; offline: boolean }> {
  const sb = await createSupabaseServerClient();
  if (!sb) return { ok: false, offline: true };
  const { data, error } = await sb
    .from("ai_chat_messages")
    .select("id,role,content,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTable(error)) return { ok: false, offline: false };
    return { ok: false, offline: true };
  }
  return {
    ok: true,
    messages: (data ?? [])
      .map((r) => ({
        id: String(r.id),
        role: r.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: String(r.content),
        createdAt: String(r.created_at),
      }))
      .reverse(),
  };
}

export async function appendAssistantMessages(
  userId: string,
  entries: { role: "user" | "assistant"; content: string }[],
): Promise<boolean> {
  const sb = await createSupabaseServerClient();
  if (!sb) return false;
  const { error } = await sb.from("ai_chat_messages").insert(
    entries.map((e) => ({ user_id: userId, role: e.role, content: e.content })),
  );
  return !error;
}

export async function clearAssistantHistory(userId: string): Promise<boolean> {
  const sb = await createSupabaseServerClient();
  if (!sb) return false;
  const { error } = await sb
    .from("ai_chat_messages")
    .delete()
    .eq("user_id", userId);
  return !error;
}
