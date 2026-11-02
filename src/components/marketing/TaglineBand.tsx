import { SITE } from "@/lib/site";

/**
 * A slow gold band of the artist's own words. The list is rendered twice and
 * translated by half its width, which is what makes the loop seamless; the
 * second copy is hidden from assistive tech so nobody hears the sentence twice.
 * Pure CSS: it costs nothing in the client bundle and stops dead under
 * prefers-reduced-motion.
 */
export function TaglineBand({ words }: { words: string[] }) {
  const items = words.filter((w) => w.trim().length > 0);
  if (items.length === 0) return null;

  return (
    <section
      aria-label={`${SITE.shortName} — ${items[0]}`}
      className="overflow-hidden border-y border-charcoal bg-ink py-5"
    >
      <div className="rk-marquee">
        {[false, true].map((duplicate) => (
          <ul
            key={String(duplicate)}
            aria-hidden={duplicate || undefined}
            className="flex shrink-0 items-center gap-8 pr-8"
          >
            {items.map((word) => (
              <li
                key={word}
                className="flex items-center gap-8 whitespace-nowrap font-[family-name:var(--font-display)] text-sm font-bold uppercase tracking-[0.28em] text-smoke"
              >
                {word}
                <span className="h-1.5 w-1.5 rotate-45 bg-gold" aria-hidden />
              </li>
            ))}
          </ul>
        ))}
      </div>
    </section>
  );
}
