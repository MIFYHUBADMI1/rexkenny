import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { SITE } from "@/lib/site";

/**
 * Double opt-in landing page: /newsletter/confirm?token=<64 hex>.
 * The token is single-use — the stored SHA-256 hash is cleared on success,
 * so a forwarded or replayed link confirms nothing.
 */

function page(title: string, message: string, status: number): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} — ${SITE.shortName}</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0d0d0f; color:#e8e6df; font-family:system-ui,sans-serif; }
  main { max-width:32rem; padding:2rem; text-align:center; }
  h1 { font-size:1.5rem; margin:0 0 .75rem; }
  p { color:#a8a49a; line-height:1.6; }
  a { color:#d4af37; }
</style>
</head>
<body><main>
<h1>${title}</h1>
<p>${message}</p>
<p><a href="/">Back to ${SITE.shortName}</a></p>
</main></body>
</html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const admin = createSupabaseAdminClient();

  if (!admin) {
    return page(
      "Confirmation unavailable",
      "The server is not configured to verify subscriptions right now. Please try again later.",
      503,
    );
  }
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return page("Invalid link", "This confirmation link is malformed. Request a new one from the signup form.", 400);
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await admin
    .from("newsletter_subscribers")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      verify_token_hash: null,
    })
    .eq("verify_token_hash", tokenHash)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    return page("Something went wrong", "We could not confirm the subscription. Please try again shortly.", 500);
  }
  if (!data) {
    return page(
      "Link already used",
      "This confirmation link is invalid, expired or has already been used. If you have not confirmed yet, sign up again to receive a fresh link.",
      410,
    );
  }

  return page(
    "You're confirmed",
    `Welcome to the ${SITE.legalName} fan list. You'll hear about new releases, videos and shows first.`,
    200,
  );
}
