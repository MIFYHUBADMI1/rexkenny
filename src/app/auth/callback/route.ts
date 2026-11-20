import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Consumes the one-time code Supabase appends after email confirmation and
 * OAuth redirects. The code is exchanged server-side; it is never echoed into
 * a client component or logged.
 */
export const dynamic = "force-dynamic";

function safeNext(value: string | null): string {
  if (!value) return "/admin";
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) return "/admin";
  return value.slice(0, 200);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?reason=no-code`);
  }

  const sb = await createSupabaseServerClient();
  if (!sb) {
    return NextResponse.redirect(`${origin}/auth/error?reason=offline`);
  }

  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    // The real reason (missing code verifier, expired flow, etc.) only shows
    // here — log it server-side and pass a short version back to the error
    // page so it is visible without dashboard log access.
    console.error("[auth/callback] code exchange failed:", error.message, error.code);
    const detail = `${error.code ?? "error"}: ${error.message}`.slice(0, 180);
    return NextResponse.redirect(
      `${origin}/auth/error?reason=exchange-failed&detail=${encodeURIComponent(detail)}`,
    );
  }

  const response = NextResponse.redirect(`${origin}${next}`);
  // One-time flag the Toaster turns into the welcome message.
  response.cookies.set("rk_welcome", "back", { path: "/", maxAge: 60, sameSite: "lax" });
  return response;
}
