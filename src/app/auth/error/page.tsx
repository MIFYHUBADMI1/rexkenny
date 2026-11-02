import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo/metadata";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Sign-in problem",
    description: "Something went wrong while signing in.",
    path: "/auth/error",
    noindex: true,
  });
}

const MESSAGES: Record<string, string> = {
  "not-staff":
    "You are signed in, but this account has no staff role, so it cannot open the dashboard. An administrator can grant you one.",
  "not-editor":
    "This area changes catalogue content. Your role can view the dashboard but not edit it.",
  "not-admin":
    "This area manages settings, users and distribution. It is restricted to administrators.",
  "no-code":
    "The sign-in link was incomplete. It may have already been used, or copied only part-way.",
  offline:
    "Supabase is not connected on this deployment, so a session cannot be created.",
  "exchange-failed":
    "That sign-in link is no longer valid. Request a new one, or sign in with your password.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  const { reason } = await searchParams;
  const key = typeof reason === "string" ? reason : "";
  const message =
    MESSAGES[key] ?? "Something went wrong while signing in. Please try again.";

  return (
    <div className="container-page max-w-md py-16">
      <p className="eyebrow">Account</p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black">
        Not signed in
      </h1>
      <p className="mt-5 text-sm leading-relaxed text-mist">{message}</p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/auth/login" className="btn-gold">
          Sign in
        </Link>
        <Link href="/" className="btn-ghost">
          Back to {SITE.shortName}
        </Link>
      </div>
    </div>
  );
}
