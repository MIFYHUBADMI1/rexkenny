"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/actions/auth";
import { hasStaffRole, useAccountSession } from "@/lib/auth/useAccountSession";

/**
 * Session-aware header link. Reads the auth cookie client-side so the rest of
 * the site can stay static — no cookies() in the layout, no forced dynamic
 * rendering. Renders nothing until the session is known to avoid flashing the
 * wrong state at signed-in users.
 *
 * Inside /admin the controls flip to "View site" + "Sign out": staff are
 * already on the dashboard, so a "Dashboard" link would loop back to itself.
 */
export function AccountLink({
  variant,
  onNavigate,
}: {
  variant: "desktop" | "mobile";
  onNavigate?: () => void;
}) {
  const account = useAccountSession();
  const pathname = usePathname();
  const inAdmin = pathname.startsWith("/admin");

  if (!account) return null;

  const { signedIn, roles } = account;
  const staff = hasStaffRole(roles);

  // Inside the dashboard: offer the way back to the public site and sign-out.
  if (inAdmin && signedIn) {
    if (variant === "desktop") {
      return (
        <span className="hidden items-center gap-2 md:flex">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-full border border-ash px-4 text-sm font-semibold text-mist transition-colors hover:border-gold hover:text-gold"
          >
            View site
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-full border border-ash px-4 text-sm font-semibold text-mist transition-colors hover:border-gold hover:text-gold"
            >
              Sign out
            </button>
          </form>
        </span>
      );
    }
    return (
      <li className="flex gap-3 py-4">
        <Link href="/" onClick={onNavigate} className="btn-ghost flex-1 text-center">
          View site
        </Link>
        <form action={signOutAction} className="flex-1">
          <button type="submit" className="btn-ghost w-full text-center">
            Sign out
          </button>
        </form>
      </li>
    );
  }

  if (variant === "desktop") {
    const className =
      "hidden h-10 items-center rounded-full border px-4 text-sm font-semibold transition-colors md:inline-flex";
    if (staff) {
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
        href={signedIn ? "/account" : "/auth/login"}
        onClick={onNavigate}
        className={`${className} border-ash text-mist hover:border-gold hover:text-gold`}
      >
        {signedIn ? "Account" : "Sign in"}
      </Link>
    );
  }

  // Mobile menu item — renders its own <li> so it can replace the auth row.
  if (staff) {
    return (
      <li className="py-4">
        <Link href="/admin" onClick={onNavigate} className="btn-gold w-full">
          Open dashboard
        </Link>
      </li>
    );
  }
  if (signedIn) {
    return (
      <li className="flex gap-3 py-4">
        <Link href="/account" onClick={onNavigate} className="btn-ghost flex-1 text-center">
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
