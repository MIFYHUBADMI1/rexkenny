import type { Metadata } from "next";
import Link from "next/link";
import { getPosts, getArtistProfile } from "@/lib/content";
import { buildMetadata, CORE_KEYWORDS } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildGraph, articleNode, breadcrumbNode, musicGroupNode } from "@/lib/seo/jsonld";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/DemoNotice";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "News & Journal",
    description: `Release announcements, studio stories, interviews and industry notes from ${SITE.shortName} and the ${SITE.legalName} team.`,
    path: "/news",
    keywords: [...CORE_KEYWORDS, "REX KENNY News"],
  });
}

export default async function NewsPage() {
  const [{ data: posts }, { data: artist }] = await Promise.all([
    getPosts(),
    getArtistProfile(),
  ]);

  return (
    <>
      <JsonLd
        data={buildGraph([
          musicGroupNode(artist),
          posts.map((p) => articleNode(p, `/news/${p.slug}`)),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "News", path: "/news" },
          ]),
        ])}
      />

      <PageHeader
        crumbs={[
          { name: "Home", path: "/" },
          { name: "News", path: "/news" },
        ]}
        title="News & Journal"
        lede="Announcements, studio writing and everything else worth telling people about."
      />

      <div className="container-page py-14">
        {posts.length === 0 ? (
          <EmptyState
            title="Nothing published yet"
            body="News, announcements and studio updates will appear here as they are published."
            action={{ href: "/contact", label: "Talk to the team" }}
          />
        ) : (
          <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/news/${p.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-lg border border-charcoal bg-ink-raised"
                >
                  {p.coverImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.coverImage}
                      alt={p.coverAlt ?? ""}
                      loading="lazy"
                      className="aspect-[16/9] w-full object-cover"
                    />
                  )}
                  <span className="flex flex-1 flex-col p-5">
                    <span className="text-[0.6875rem] uppercase tracking-[0.18em] text-gold">
                      {p.category}
                    </span>
                    <span className="mt-2 text-lg font-semibold leading-snug group-hover:text-gold">
                      {p.title}
                    </span>
                    <span className="mt-2 flex-1 text-sm leading-relaxed text-smoke">
                      {p.excerpt}
                    </span>
                    {p.publishedAt && (
                      <time
                        dateTime={p.publishedAt}
                        className="mt-4 block text-xs text-smoke"
                      >
                        {p.publishedAt.slice(0, 10)} · {p.readingMinutes} min read
                      </time>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
