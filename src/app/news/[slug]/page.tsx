import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getPostBySlug, getPosts, getPostSlugs, getArtistProfile } from "@/lib/content";
import { buildMetadata } from "@/lib/seo/metadata";
import { postMeta } from "@/lib/seo/page-meta";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildGraph, articleNode, musicGroupNode, breadcrumbNode } from "@/lib/seo/jsonld";
import { SITE } from "@/lib/site";
import { sanitizeHtml } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { data: p } = await getPostBySlug(slug);
  if (!p) return buildMetadata({ title: "Post not found", path: `/news/${slug}`, noindex: true });

  return buildMetadata(postMeta(p));
}

export default async function NewsArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [{ data: post }, { data: all }, { data: artist }] = await Promise.all([
    getPostBySlug(slug),
    getPosts(),
    getArtistProfile(),
  ]);

  if (!post) notFound();

  const more = all.filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <>
      <JsonLd
        data={buildGraph([
          musicGroupNode(artist),
          articleNode(post, `/news/${post.slug}`),
          breadcrumbNode([
            { name: "Home", path: "/" },
            { name: "News", path: "/news" },
            { name: post.title, path: `/news/${post.slug}` },
          ]),
        ])}
      />

      <article className="container-page max-w-3xl py-12 md:py-16">
        <nav aria-label="Breadcrumb" className="text-xs text-smoke">
          <Link href="/" className="hover:text-gold">Home</Link>
          <span className="mx-2">/</span>
          <Link href="/news" className="hover:text-gold">News</Link>
          <span className="mx-2">/</span>
          <span aria-current="page" className="text-gold">{post.title}</span>
        </nav>

        <p className="eyebrow mt-6">{post.category}</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-black leading-tight md:text-5xl">
          {post.title}
        </h1>
        <p className="mt-4 flex flex-wrap items-center gap-x-3 text-sm text-smoke">
          <span>{post.authorName}</span>
          {post.publishedAt && (
            <>
              <span aria-hidden>·</span>
              <time dateTime={post.publishedAt}>{post.publishedAt.slice(0, 10)}</time>
            </>
          )}
          <span aria-hidden>·</span>
          <span>{post.readingMinutes} min read</span>
        </p>

        {post.coverImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImage}
            alt={post.coverAlt ?? ""}
            className="mt-8 aspect-[16/9] w-full rounded-xl border border-charcoal object-cover"
          />
        )}

        <p className="mt-8 text-lg leading-relaxed text-mist">{post.excerpt}</p>

        {/* bodyHtml passes through sanitizeHtml(): tags are allow-listed and
            scripts, iframes and event handlers are stripped server-side. */}
        <div
          className="prose-invert mt-6 space-y-5 leading-relaxed text-smoke [&_a]:text-gold [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-paper [&_img]:rounded-lg [&_li]:ml-5 [&_p]:mt-4 [&_ul]:mt-4"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.bodyHtml) }}
        />

        <footer className="mt-12 border-t border-charcoal pt-6 text-sm">
          <Link href="/news" className="text-gold">More from the journal</Link>
          <span className="text-smoke"> · Written by {post.authorName} · {SITE.shortName}</span>
        </footer>

        {more.length > 0 && (
          <section className="mt-12">
            <h2 className="eyebrow">Read next</h2>
            <ul className="mt-4 space-y-3">
              {more.map((p) => (
                <li key={p.slug}>
                  <Link href={`/news/${p.slug}`} className="group block rounded-lg border border-charcoal p-4 hover:border-gold">
                    <span className="block font-semibold group-hover:text-gold">{p.title}</span>
                    <span className="mt-1 block text-sm text-smoke">{p.excerpt}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </>
  );
}

export async function generateStaticParams() {
  const slugs = await getPostSlugs();
  return slugs.map((slug) => ({ slug }));
}
