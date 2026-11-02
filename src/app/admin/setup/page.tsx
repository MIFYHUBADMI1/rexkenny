import type { Metadata } from "next";
import Link from "next/link";
import { integrationStates, env } from "@/lib/config";
import { buildMetadata } from "@/lib/seo/metadata";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Setup status",
    description: `Configuration status for ${SITE.url}: which integrations are live and exactly what is still required.`,
    path: "/admin/setup",
    noindex: true,
  });
}

/**
 * Public-safe status page: reports which integrations are configured and what
 * remains. It prints variable names only — never values, never secrets.
 */
export default function SetupPage() {
  const states = integrationStates();
  const ready = states.filter((s) => s.configured).length;

  return (
    <div className="container-page max-w-3xl py-14">
      <p className="eyebrow">Configuration</p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black">
        Setup status
      </h1>
      <p className="mt-4 leading-relaxed text-smoke">
        {ready === 0
          ? "Nothing is connected yet. The site runs on labelled placeholder content, and every write path (contact forms, newsletter, admin) reports that it is offline rather than pretending to succeed."
          : `${ready} of ${states.length} integrations are configured.`}
      </p>

      <ul className="mt-8 divide-y divide-charcoal rounded-lg border border-charcoal">
        {states.map((s) => (
          <li key={s.key} className="flex items-start gap-4 p-5">
            <span
              className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                s.configured ? "bg-gold" : "bg-blood"
              }`}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block font-semibold">{s.label}</span>
              <span className="mt-1 block text-sm text-smoke">
                {s.configured ? "Connected." : s.action}
              </span>
            </span>
            <span className="ml-auto shrink-0 text-xs uppercase tracking-[0.16em] text-smoke">
              {s.configured ? "Live" : "Offline"}
            </span>
          </li>
        ))}
      </ul>

      <section className="mt-10 rounded-lg border border-charcoal bg-ink-raised p-6 text-sm leading-relaxed text-smoke">
        <h2 className="text-base font-semibold text-paper">Environment file</h2>
        <p className="mt-3">
          Copy <code className="text-gold">.env.example</code> to{" "}
          <code className="text-gold">.env.local</code> and fill the values. This deploy
          currently resolves its canonical URL to{" "}
          <span className="text-mist">{env.siteUrl}</span>
          {env.siteUrl.includes("localhost")
            ? " — set NEXT_PUBLIC_SITE_URL to your live domain before launching, or every canonical tag, sitemap entry and structured-data URL will point at localhost."
            : "."}
        </p>
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="btn-ghost">Back to the site</Link>
        <Link href="/contact" className="btn-ghost">Contact</Link>
      </div>
    </div>
  );
}
