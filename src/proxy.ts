import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * The proxy is a user-experience gate, not the security boundary.
 *
 * It keeps the auth cookie fresh and bounces obvious strangers away from
 * /admin so they see a sign-in page instead of a wall of permission errors. The
 * real enforcement is Row Level Security in the database plus the requireStaff /
 * requireEditor / requireAdmin guards inside each server component — those read
 * the verified token, so deleting this file changes nothing about which data an
 * unauthorised caller can reach.
 *
 * It runs only on /admin, so public pages pay no extra network round trip.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  // /admin/setup explains exactly what is missing and is safe to show, so it is
  // the one admin path that never requires a session.
  if (request.nextUrl.pathname === "/admin/setup") {
    return NextResponse.next();
  }

  // Without a configured Supabase there is no session to check and nothing to
  // sign into: point at the setup page rather than a login form that could
  // never work.
  if (!url || !anonKey) {
    return NextResponse.redirect(new URL("/admin/setup", request.url));
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (
        list: { name: string; value: string; options: Record<string, unknown> }[],
      ) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        list.forEach(({ name, value, options }) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          supabaseResponse.cookies.set(name, value, options as any),
        );
      },
    },
  });

  // getUser() asks Supabase to verify the token. A cookie copied into another
  // browser, or one whose refresh token has just been rotated, fails here
  // instead of being trusted locally.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const target = new URL("/auth/login", request.url);
    target.searchParams.set("next", request.nextUrl.pathname);
    const redirectResponse = NextResponse.redirect(target);
    // Carry any rotated cookies across the redirect, or the login page would
    // also see no session.
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => redirectResponse.cookies.set(cookie.name, cookie.value));
    return redirectResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/admin/:path*"],
};
