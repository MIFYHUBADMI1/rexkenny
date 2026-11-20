"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isRole, STAFF_ROLES, type Role } from "@/lib/auth/roles";

export type AccountSession = {
  signedIn: boolean;
  roles: Role[];
};

/**
 * Client-side session read for chrome components (header, menus). The root
 * layout must stay static, so the session is resolved in the browser from the
 * auth cookie — presentation only; RLS remains the enforcement point.
 * Returns null while the session is still being read.
 */
export function useAccountSession(): AccountSession | null {
  const [session, setSession] = useState<AccountSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    const finish = (s: AccountSession) => {
      if (!cancelled) setSession(s);
    };

    void (async () => {
      const sb = createSupabaseBrowserClient();
      if (!sb) {
        finish({ signedIn: false, roles: [] });
        return;
      }
      const { data } = await sb.auth.getSession();
      const user = data.session?.user ?? null;
      if (!user) {
        finish({ signedIn: false, roles: [] });
        return;
      }
      let roles = Array.isArray(user.app_metadata?.roles)
        ? (user.app_metadata.roles as unknown[]).filter(isRole)
        : [];
      if (roles.length === 0) {
        // JWT claims not refreshed yet — user_roles is readable by its owner.
        const { data: rows } = await sb
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        roles = (rows ?? []).map((r: { role: unknown }) => r.role).filter(isRole);
      }
      finish({ signedIn: true, roles });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return session;
}

export function hasStaffRole(roles: Role[]): boolean {
  return roles.some((r) => STAFF_ROLES.includes(r));
}
