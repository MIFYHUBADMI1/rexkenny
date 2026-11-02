import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/config";

/**
 * Browser/edge server client bound to the request cookie store.
 * Uses the anon key only — RLS decides what is visible.
 * Returns null when Supabase is not configured so callers can degrade honestly.
 */
export async function createSupabaseServerClient() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  const cookieStore = await cookies();
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
