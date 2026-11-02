import Link from "next/link";
import { Play, ChevronRight } from "lucide-react";
import type { ArtistProfileData, Release } from "@/lib/types";
import { SITE } from "@/lib/site";
import { motionVars } from "@/components/motion/style";

export function Hero({
  artist,
  featured,
}: {
  artist: ArtistProfileData;
  featured: Release | null;
}) {
  return (
    <section className="relative isolate overflow-hidden border-b border-charcoal">
      {/* Background photograph. Decorative: alt is empty, text carries meaning. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={artist.photoUrl ?? "/images/rex-kenny-press-1-1600.jpg"}
        alt=""
        aria-hidden="true"
        className="rk-kenburns absolute inset-0 -z-10 h-full w-full object-cover object-center opacity-40"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/85 to-ink/40" />

      <div className="container-page py-24 md:py-36">
        <p className="eyebrow rk-enter">{SITE.city} · {SITE.country}</p>
        <h1 className="rk-enter mt-4 font-[family-name:var(--font-display)] text-5xl font-black leading-[0.95] tracking-tight md:text-7xl lg:text-8xl">
          {SITE.shortName}
        </h1>
        <p
          className="rk-enter mt-5 max-w-2xl text-lg text-gold md:text-xl"
          style={motionVars({ "--rk-delay": "140ms" })}
        >
          {SITE.roles.slice(0, 4).join(" · ")}
        </p>
        <p
          className="rk-enter mt-3 max-w-xl text-base leading-relaxed text-mist"
          style={motionVars({ "--rk-delay": "220ms" })}
        >
          {SITE.tagline} {artist.bioShort}
        </p>

        <div
          className="rk-enter mt-9 flex flex-wrap items-center gap-3"
          style={motionVars({ "--rk-delay": "300ms" })}
        >
          <Link href={featured ? `/music/${featured.slug}` : "/music"} className="btn-gold">
            <Play size={16} fill="currentColor" /> Listen Now
          </Link>
          <Link href="/music" className="btn-ghost">
            Explore Music <ChevronRight size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}
