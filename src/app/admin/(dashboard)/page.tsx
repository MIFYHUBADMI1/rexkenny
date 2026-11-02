import Link from "next/link";
import { AlertTriangle, Database, CircleCheck } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/session";
import { integrationStates, isSupabaseConfigured } from "@/lib/config";
import { visibleModules } from "@/lib/admin/modules";
import { SITE } from "@/lib/site";

type Count = { label: string; value: number | null; href: string; caveat?: string };

/**
 * Counts rows that exist. Returns null when the table is missing so the page can
 * say "table missing" rather than "0", which would be a different claim.
 */
async function countRows(
  run: () => PromiseLike<{ count: number | null; error: { code?: string; message?: string } | null }>,
): Promise<number | null> {
  try {
    const result = await run();
    if (result.error) return null;
    return result.count ?? 0;
  } catch {
    return null;
  }
}

export default async function AdminOverview() {
  const session = await requireStaff();
  const sb = await createSupabaseServerClient();

  const states = integrationStates();
  const offline = states.filter((s) => !s.configured);

  let counts: Count[] = [];
  if (sb) {
    const released = await countRows(() =>
      sb.from("releases").select("*", { count: "exact", head: true }).eq("status", "released"),
    );
    const drafts = await countRows(() =>
      sb.from("releases").select("*", { count: "exact", head: true }).neq("status", "released"),
    );
    const videos = await countRows(() =>
      sb
        .from("music_videos")
        .select("*", { count: "exact", head: true })
        .eq("published", true),
    );
    const posts = await countRows(() =>
      sb.from("blog_posts").select("*", { count: "exact", head: true }).eq("status", "published"),
    );
    const beats = await countRows(() =>
      sb.from("beats").select("*", { count: "exact", head: true }).eq("published", true),
    );
    const subscribers = await countRows(() =>
      sb
        .from("newsletter_subscribers")
        .select("*", { count: "exact", head: true })
        .eq("status", "confirmed"),
    );
    const pendingSubscribers = await countRows(() =>
      sb
        .from("newsletter_subscribers")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
    );
    const enquiries = await countRows(() =>
      sb
        .from("contact_submissions")
        .select("*", { count: "exact", head: true })
        .eq("status", "new"),
    );

    counts = [
      { label: "Releases live", value: released, href: "/admin/releases" },
      { label: "Releases not live", value: drafts, href: "/admin/releases" },
      { label: "Videos published", value: videos, href: "/admin/media" },
      { label: "Posts published", value: posts, href: "/admin/content" },
      { label: "Beats listed", value: beats, href: "/admin/content" },
      {
        label: "Confirmed subscribers",
        value: subscribers,
        href: "/admin/newsletter",
        caveat: "Only confirmed addresses may be sent to.",
      },
      { label: "Awaiting confirmation", value: pendingSubscribers, href: "/admin/newsletter" },
      { label: "New enquiries", value: enquiries, href: "/admin/enquiries" },
    ];
  }

  const modules = visibleModules(session.roles).filter((m) => m.built && m.href !== "/admin");

  return (
    <div className="space-y-10">
      <section>
        <p className="eyebrow">{SITE.shortName} HQ</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black">
          Overview
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-smoke">
          Signed in as <span className="text-mist">{session.email ?? "an account"}</span> with
          role{session.roles.length === 1 ? "" : "s"}{" "}
          <span className="text-gold">{session.roles.join(", ") || "none"}</span>. Access is
          enforced by database policies, not by this page — what you can see here is exactly
          what the rules in the migrations allow.
        </p>
      </section>

      {!isSupabaseConfigured ? (
        <section className="rounded-lg border border-blood/40 bg-blood/5 p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold text-paper">
            <Database className="h-4 w-4 text-blood-bright" aria-hidden />
            No database connected
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-smoke">
            Every number below would be a fiction, so none are shown. The public site runs on
            labelled placeholder content and every write path reports itself as offline.
          </p>
          <Link href="/admin/setup" className="btn-gold mt-5 inline-flex">
            Open setup status
          </Link>
        </section>
      ) : (
        <section>
          <h2 className="text-sm uppercase tracking-[0.18em] text-smoke">In your database</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {counts.map((c) => (
              <div key={c.label} className="rounded-lg border border-charcoal bg-ink-raised p-5">
                <dt className="text-xs uppercase tracking-[0.14em] text-smoke">{c.label}</dt>
                <dd className="mt-2 text-3xl font-black text-paper">
                  {c.value === null ? (
                    <span className="text-base font-semibold text-blood-bright">
                      table missing
                    </span>
                  ) : (
                    c.value
                  )}
                </dd>
                {c.caveat && <p className="mt-2 text-[11px] leading-snug text-smoke">{c.caveat}</p>}
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-smoke">
            These are row counts in your own database. They are not streams, plays or revenue —
            this site cannot know those unless a provider is connected and reports them.
          </p>
        </section>
      )}

      {offline.length > 0 && (
        <section className="rounded-lg border border-charcoal bg-ink-raised p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold text-paper">
            <AlertTriangle className="h-4 w-4 text-gold" aria-hidden />
            {offline.length} integration{offline.length === 1 ? "" : "s"} not connected
          </h2>
          <ul className="mt-4 space-y-3">
            {offline.map((s) => (
              <li key={s.key} className="flex gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blood" aria-hidden />
                <span>
                  <span className="block text-mist">{s.label}</span>
                  <span className="block text-xs text-smoke">{s.action}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {offline.length === 0 && (
        <section className="rounded-lg border border-gold/30 bg-gold/5 p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold text-paper">
            <CircleCheck className="h-4 w-4 text-gold" aria-hidden />
            All environment variables are present
          </h2>
          <p className="mt-2 text-sm text-smoke">
            Present is not the same as working: each provider still has to accept a real test
            call before the dashboard will report it as connected.
          </p>
        </section>
      )}

      <section>
        <h2 className="text-sm uppercase tracking-[0.18em] text-smoke">Ready to use</h2>
        {modules.length === 0 ? (
          <p className="mt-4 text-sm text-smoke">
            Nothing yet beyond this overview and the setup page. The catalogue, distribution,
            SEO and fan modules are still being built.
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {modules.map((m) => (
              <li key={m.href}>
                <Link
                  href={m.href}
                  className="block rounded-lg border border-charcoal bg-ink-raised p-5 transition hover:border-gold"
                >
                  <span className="block font-semibold text-paper">{m.label}</span>
                  <span className="mt-1 block text-sm text-smoke">{m.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
