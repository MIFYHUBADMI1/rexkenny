import Link from "next/link";

type Dest = { platform: string; url: string };

/**
 * Renders only destinations that actually exist in the CMS. An unavailable
 * platform is omitted rather than pointed at a search page — a fake link
 * would damage the release's credibility with both fans and crawlers.
 */
export function SmartLinkGrid({
  destinations,
  releaseSlug,
}: {
  destinations: Dest[];
  releaseSlug: string | null;
}) {
  const live = destinations.filter((d) => /^https?:\/\//.test(d.url));

  if (live.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-ash bg-ink-raised p-8">
        <p className="font-semibold text-mist">No verified destinations yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-smoke">
          Streaming URLs are added per release in the admin. Until one is saved here, this
          page stays quiet instead of guessing where the music might be.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/music" className="btn-ghost">Browse the catalogue</Link>
          <Link href="/contact" className="btn-ghost">Ask about availability</Link>
        </div>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {live.map((d) => (
        <li key={`${d.platform}-${d.url}`}>
          <a
            href={d.url}
            target="_blank"
            rel="noopener noreferrer"
            data-platform={d.platform}
            data-release={releaseSlug ?? undefined}
            className="flex items-center justify-between rounded-lg border border-ash bg-ink-raised px-5 py-4 text-left transition-colors hover:border-gold"
          >
            <span>
              <span className="block font-semibold">{d.platform}</span>
              <span className="block truncate text-xs text-smoke">{d.url}</span>
            </span>
            <span className="ml-3 text-xs uppercase tracking-[0.16em] text-gold">Open</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
