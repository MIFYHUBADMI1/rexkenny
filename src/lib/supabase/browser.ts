"use client";

import { createBrowserClient } from "@supabase/ssr";
import { env } from "@/lib/config";

let cached: ReturnType<typeof createBrowserClient> | null = null;

export function createSupabaseBrowserClient() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  if (!cached) {
    cached = createBrowserClient(env.supabaseUrl, env.supabaseAnonKey);
  }
  return cached;
}
