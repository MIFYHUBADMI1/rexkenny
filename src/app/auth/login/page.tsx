import type { Metadata } from "next";
import { AuthForm } from "@/components/forms/AuthForm";
import { buildMetadata } from "@/lib/seo/metadata";
import { isSupabaseConfigured } from "@/lib/config";
import { sessionOrNull } from "@/lib/auth/session";
import { signOutAction } from "@/actions/auth";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Sign in",
    description: `Sign in to ${SITE.shortName}'s fan area and dashboard.`,
    path: "/auth/login",
    noindex: true,
  });
}

function safeNext(value: string | string[] | undefined): string {
  const raw = typeof value === "string" ? value : "";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return "/admin";
  return raw.slice(0, 200);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const target = safeNext(next);
  const session = await sessionOrNull();

  return (
    <div className="container-page max-w-md py-16">
      <p className="eyebrow">Account</p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black">Sign in</h1>
      <p className="mt-4 text-sm leading-relaxed text-smoke">
        Fans use this for favourites. The artist team uses it for the dashboard.
      </p>

      {session && (
        <div className="mt-6 rounded-lg border border-gold/40 bg-gold/5 p-4 text-sm text-gold">
          <p>
            You are signed in{session.email ? ` as ${session.email}` : ""}
            {session.roles.length > 0 && ` (${session.roles.join(", ")})`}.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {session.isStaff && (
              <a href={target} className="underline">
                Go to the dashboard
              </a>
            )}
            <form action={signOutAction}>
              <button type="submit" className="underline">
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}

      {isSupabaseConfigured ? (
        <AuthForm mode="login" next={target} googleAvailable />
      ) : (
        <p className="mt-8 rounded-lg border border-charcoal bg-ink-raised p-5 text-sm leading-relaxed text-smoke">
          Accounts are not available on this site yet — please check back soon.
        </p>
      )}
    </div>
  );
}
