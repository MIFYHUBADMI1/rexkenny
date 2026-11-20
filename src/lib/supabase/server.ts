import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/config";

/**
 * Browser/edge server client bound to the request cookie store.
 * Uses the anon key only — RLS decides what is visible.
 * Returns null when Supabase is not configured so callers can degrade honestly.
 */
/**
 * Anonymous client with no cookie binding. Safe in every context — request
 * handlers, server actions, generateStaticParams and sitemaps at build time —
 * because it never touches next/headers. RLS still decides what is visible,
 * and public content reads only need the anon role.
 */
export function createSupabasePublicClient() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createSupabaseServerClient() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  let cookieStore: Awaited<ReturnType<typeof cookies>>;
  try {
    cookieStore = await cookies();
  } catch {
    // generateStaticParams / sitemaps run at build time with no request, so
    // there is no cookie store to bind. An anonymous client is enough: the
    // queries in lib/content.ts only read public rows gated by RLS.
    return createSupabasePublicClient();
  }
  return createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      get: (name: string) => cookieStore.get(name)?.value,
      setAll: (
        list: { name: string; value: string; options: Record<string, unknown> }[],
      ) => {
        try {
          list.forEach(({ name, value, options }) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cookieStore.set(name, value, options as any),
          );
        } catch {
          // Called from a Server Component: safe to ignore, the layout refreshes session.
        }
      },
      serialize: (
        name: string,
        value: string,
        options: Record<string, unknown>,
      ) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return cookieStore.set(name, value, options as any);
        } catch {
          return undefined;
        }
      },
    },
  });
}
