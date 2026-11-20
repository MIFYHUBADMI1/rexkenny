"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { signOutAction } from "@/actions/auth";
import { STAFF_ROLES, isRole } from "@/lib/auth/roles";

type AccountState = "loading" | "out" | "staff" | "fan";

function rolesFromClaims(user: { app_metadata?: Record<string, unknown> } | null) {
  const roles = user?.app_metadata?.roles;
  return Array.isArray(roles) ? roles.filter(isRole) : [];
}

function isStaffRoles(roles: ReturnType<typeof rolesFromClaims>): boolean {
  // Every account carries 'fan'; staff means one of the dashboard roles.
  return roles.some((r) => (STAFF_ROLES as string[]).includes(r));
}

/**
 * Session-aware header link. Reads the auth cookie client-side so the rest of
 * the site can stay static — no cookies() in the layout, no forced dynamic
 * rendering. Renders nothing until the session is known to avoid flashing the
 * wrong state at signed-in users.
 */
export function AccountLink({
  variant,
  onNavigate,
}: {
  variant: "desktop" | "mobile";
  onNavigate?: () => void;
}) {
  const [state, setState] = useState<AccountState>("loading");

  useEffect(() => {
    const sb = createSupabaseBrowserClient();
    if (!sb) {
      setState("out");
      return;
    }
    let cancelled = false;
    sb.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      const user = data.session?.user ?? null;
      if (!user) {
        setState("out");
        return;
      }
      let roles = rolesFromClaims(user);
      if (roles.length === 0) {
        // JWT claims not refreshed yet — user_roles is readable by its owner.
        const { data: rows } = await sb
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        roles = (rows ?? []).map((r) => r.role).filter(isRole);
      }
      if (cancelled) return;
      setState(isStaffRoles(roles) ? "staff" : "fan");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") return null;

  if (variant === "desktop") {
    const className =
      "hidden h-10 items-center rounded-full border px-4 text-sm font-semibold transition-colors md:inline-flex";
    if (state === "staff") {
      return (
        <Link
          href="/admin"
          onClick={onNavigate}
          className={`${className} border-gold/60 text-gold hover:bg-gold hover:text-ink`}
        >
          Dashboard
        </Link>
      );
    }
    return (
      <Link
        href="/auth/login"
        onClick={onNavigate}
        className={`${className} border-ash text-mist hover:border-gold hover:text-gold`}
      >
        {state === "fan" ? "Account" : "Sign in"}
      </Link>
    );
  }

  // Mobile menu item — renders its own <li> so it can replace the auth row.
  if (state === "staff") {
    return (
      <li className="py-4">
        <Link href="/admin" onClick={onNavigate} className="btn-gold w-full">
          Open dashboard
        </Link>
      </li>
    );
  }
  if (state === "fan") {
    return (
      <li className="flex gap-3 py-4">
        <Link href="/auth/login" onClick={onNavigate} className="btn-ghost flex-1 text-center">
          Account
        </Link>
        <form action={signOutAction} className="flex-1">
          <button type="submit" className="btn-ghost w-full text-center">
            Sign out
          </button>
        </form>
      </li>
    );
  }
  return (
    <li className="flex gap-3 py-4">
      <Link href="/auth/login" onClick={onNavigate} className="btn-ghost flex-1 text-center">
        Sign in
      </Link>
      <Link href="/auth/register" onClick={onNavigate} className="btn-gold flex-1 text-center">
        Create account
      </Link>
    </li>
  );
}
