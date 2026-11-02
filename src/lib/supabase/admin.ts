import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/config";

/**
 * Bypasses RLS. Server-side only, never imported by client components,
 * never re-exported through a public barrel. Used by admin server actions
 * and webhooks after the caller has already verified the session role.
 */
export function createSupabaseAdminClient(): SupabaseClient | null {
  if (!env.supabaseUrl || !env.serviceRoleKey) return null;
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "Cache-Control": "no-store" } },
  });
}
