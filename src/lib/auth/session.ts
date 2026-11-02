import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isRole, roleChecks, type Role } from "@/lib/auth/roles";

export type Session = {
  userId: string;
  email: string | null;
  roles: Role[];
  isStaff: boolean;
  canEditContent: boolean;
  isAdmin: boolean;
};

/**
 * Reads the caller's session.
 *
 * getUser() is used rather than getSession() because it asks Supabase to verify
 * the token: a cookie copied into another browser must not be believed locally.
 * Roles come from the JWT first (no extra round trip) and fall back to the
 * user_roles table when the mirror has not been refreshed yet — for example
 * immediately after an admin grants a role.
 *
 * This function is a convenience for rendering the right UI. Authorization is
 * enforced by Row Level Security in the database, so a bug here cannot expose a
 * row the policies forbid.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const sb = await createSupabaseServerClient();
  if (!sb) return null;

  const {
    data: { user },
    error,
  } = await sb.auth.getUser();
  if (error || !user) return null;

  const fromClaims = Array.isArray(user.app_metadata?.roles)
    ? (user.app_metadata.roles as unknown[]).filter(isRole)
    : [];

  let roles: Role[] = fromClaims;
  if (roles.length === 0) {
    const { data } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    roles = (data ?? []).map((r) => r.role as unknown).filter(isRole);
  }

  return {
    userId: user.id,
    email: user.email ? user.email.toLowerCase() : null,
    roles,
    ...roleChecks(roles),
  };
});

/** Never returns null: sends the visitor to the sign-in page instead. */
export async function requireSession(next: string = "/admin"): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  return session;
}

export async function requireStaff(next: string = "/admin"): Promise<Session> {
  const session = await requireSession(next);
  if (!session.isStaff) redirect("/auth/error?reason=not-staff");
  return session;
}

export async function requireEditor(next: string = "/admin"): Promise<Session> {
  const session = await requireStaff(next);
  if (!session.canEditContent) redirect("/auth/error?reason=not-editor");
  return session;
}

export async function requireAdmin(next: string = "/admin"): Promise<Session> {
  const session = await requireStaff(next);
  if (!session.isAdmin) redirect("/auth/error?reason=not-admin");
  return session;
}

/** Safe for use in a page that must render either way. */
export async function sessionOrNull(): Promise<Session | null> {
  try {
    return await getSession();
  } catch {
    return null;
  }
}
