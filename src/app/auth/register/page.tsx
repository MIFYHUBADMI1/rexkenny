import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/forms/AuthForm";
import { buildMetadata } from "@/lib/seo/metadata";
import { isSupabaseConfigured } from "@/lib/config";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Create an account",
    description: `Create a ${SITE.shortName} account to save favourites and get release news by email.`,
    path: "/auth/register",
    noindex: true,
  });
}

function safeNext(value: string | string[] | undefined): string {
  const raw = typeof value === "string" ? value : "";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return "/admin";
  return raw.slice(0, 200);
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const target = safeNext(next);

  return (
    <div className="container-page max-w-md py-16">
      <p className="eyebrow">Account</p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black">
        Create an account
      </h1>
      <p className="mt-4 text-sm leading-relaxed text-smoke">
        Creating an account only makes you a fan — it never gives access to the
        artist dashboard.
      </p>

      {isSupabaseConfigured ? (
        <AuthForm mode="register" next={target} googleAvailable />
      ) : (
        <p className="mt-8 rounded-lg border border-charcoal bg-ink-raised p-5 text-sm leading-relaxed text-smoke">
          Registration is unavailable right now — please try again later.
        </p>
      )}

      <p className="mt-6 text-xs leading-relaxed text-smoke">
        We keep your email address and the date you consented, and nothing else that
        identifies you. See the{" "}
        <Link href="/privacy-policy" className="text-gold">
          privacy policy
        </Link>
        .
      </p>
    </div>
  );
}
