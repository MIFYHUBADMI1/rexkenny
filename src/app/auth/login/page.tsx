import type { Metadata } from "next";
import { AuthForm } from "@/components/forms/AuthForm";
import { buildMetadata } from "@/lib/seo/metadata";
import { isSupabaseConfigured } from "@/lib/config";
import { sessionOrNull } from "@/lib/auth/session";
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
        Fans use this for favourites. The artist team uses it for the dashboard at{" "}
        <span className="text-mist">/admin</span>.
      </p>

      {session?.isStaff && (
        <p className="mt-6 rounded-lg border border-gold/40 bg-gold/5 p-4 text-sm text-gold">
          You are signed in as {session.roles.join(", ")}.{" "}
          <a href={target} className="underline">
            Go to the dashboard
          </a>
          .
        </p>
      )}

      {isSupabaseConfigured ? (
        <AuthForm mode="login" next={target} googleAvailable />
      ) : (
        <p className="mt-8 rounded-lg border border-charcoal bg-ink-raised p-5 text-sm leading-relaxed text-smoke">
          No accounts exist on this deployment yet: Supabase is not connected, so there is
          nothing to sign in to. Set <span className="text-gold">NEXT_PUBLIC_SUPABASE_URL</span>{" "}
          and <span className="text-gold">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>, run the
          migrations, then register the first account and grant it a staff role.
        </p>
      )}
    </div>
  );
}
