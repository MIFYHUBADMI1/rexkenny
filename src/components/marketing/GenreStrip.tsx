import Link from "next/link";

/**
 * Genre links drive internal crawl paths like /music?genre=afrobeat.
 * Only genres that exist in the CMS are rendered.
 */
export function GenreStrip({ genres }: { genres: string[] }) {
  if (genres.length === 0) return null;

  return (
    <section className="border-y border-charcoal bg-ink-soft py-10">
      <div className="container-page">
        <p className="eyebrow">Sound</p>
        <ul className="mt-4 flex flex-wrap gap-2.5">
          {genres.map((g) => (
            <li key={g}>
              <Link
                href={`/music?genre=${encodeURIComponent(g.toLowerCase())}`}
                className="inline-block rounded-full border border-ash px-4 py-2 text-sm font-semibold text-mist transition-[color,border-color,transform] duration-300 hover:scale-[1.04] hover:border-gold hover:text-gold"
              >
                {g}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
