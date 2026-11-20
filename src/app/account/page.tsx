import type { Metadata } from "next";
import Link from "next/link";
import { Heart, Disc3 } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getReleases } from "@/lib/content";
import { buildMetadata } from "@/lib/seo/metadata";
import { signOutAction } from "@/actions/auth";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Your account",
    description: `Your ${SITE.shortName} fan account.`,
    path: "/account",
    noindex: true,
  });
}

export default async function AccountPage() {
  const session = await requireSession("/account");

  const sb = await createSupabaseServerClient();
  let displayName: string | null = null;
  let favouriteIds: string[] = [];

  if (sb) {
    const [profile, favs] = await Promise.all([
      sb.from("profiles").select("display_name").eq("id", session.userId).maybeSingle(),
      sb
        .from("fan_favourites")
        .select("release_id, added_at")
        .eq("user_id", session.userId)
        .order("added_at", { ascending: false }),
    ]);
    displayName = (profile.data?.display_name as string | null) ?? null;
    favouriteIds = (favs.data ?? []).map((f) => f.release_id as string);
  }

  const { data: releases } = await getReleases();
  const saved = releases.filter((r) => favouriteIds.includes(r.id));

  return (
    <div className="container-page max-w-4xl py-14">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Account</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-black">
            {displayName ?? "Your account"}
          </h1>
          <p className="mt-2 text-sm text-smoke">{session.email}</p>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="btn-ghost">
            Sign out
          </button>
        </form>
      </div>

      <section className="mt-10">
        <h2 className="eyebrow flex items-center gap-2">
          <Heart size={14} className="text-gold" /> Favourites
        </h2>
        {saved.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-ash bg-ink-raised p-8 text-center">
            <p className="text-sm text-smoke">
              Nothing saved yet. Tap “Save to favourites” on any release to keep it here.
            </p>
            <Link href="/music" className="btn-gold mt-5 inline-flex">
              Browse music
            </Link>
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {saved.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/music/${r.slug}`}
                  className="group block overflow-hidden rounded-lg border border-charcoal bg-ink-raised"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={r.artworkUrl ?? "/images/placeholder-cover-800.jpg"}
                    alt={r.artworkAlt}
                    loading="lazy"
                    width={800}
                    height={800}
                    className="aspect-square w-full object-cover"
                  />
                  <span className="block p-3">
                    <span className="block truncate text-sm font-semibold group-hover:text-gold">
                      {r.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-smoke">
                      <Disc3 size={11} /> {r.releaseType}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-10 text-xs leading-relaxed text-smoke">
        Newsletter preferences and release news are managed from the signup form —
        every email includes a one-click unsubscribe.
      </p>
    </div>
  );
}
