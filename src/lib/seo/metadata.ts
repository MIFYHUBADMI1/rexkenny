import type { Metadata } from "next";
import { SITE } from "@/lib/site";

export { SITE };

export function absoluteUrl(path = "/"): string {
  if (path.startsWith("http")) return path;
  return `${SITE.url}${path.startsWith("/") ? path : `/${path}`}`;
}

interface BuildMeta {
  title?: string | null;
  description?: string | null;
  path: string;
  /** Explicit canonical overrides the site URL + path. */
  canonical?: string | null;
  image?: string | null;
  imageAlt?: string;
  type?: "website" | "article" | "profile";
  keywords?: string[];
  publishedTime?: string | null;
  modifiedTime?: string | null;
  noindex?: boolean;
  section?: string;
}

/**
 * One metadata builder for every page: title, description, canonical,
 * Open Graph, Twitter cards and robots directives stay consistent.
 */
export function buildMetadata({
  title,
  description,
  path,
  canonical,
  image,
  imageAlt,
  type = "website",
  keywords,
  publishedTime,
  modifiedTime,
  noindex = false,
  section,
}: BuildMeta): Metadata {
  const fullTitle = title ? `${title} | ${SITE.shortName}` : SITE.title;
  const desc = (description ?? SITE.description).slice(0, 300);
  const url = absoluteUrl(path);
  const ogImage = image ? absoluteUrl(image) : absoluteUrl(SITE.ogImage);

  return {
    // `title: undefined` would overwrite a layout's `title.default`, which is
    // how the home page ends up with no <title> element at all.
    ...(title ? { title } : {}),
    description: desc,
    keywords: keywords?.filter(Boolean),
    alternates: {
      canonical: canonical ?? url,
      languages: { "x-default": url, en: url },
    },
    openGraph: {
      type: type === "profile" ? "profile" : type === "article" ? "article" : "website",
      url,
      siteName: SITE.name,
      title: fullTitle,
      description: desc,
      locale: SITE.locale,
      images: [{ url: ogImage, width: 1200, height: 630, alt: imageAlt ?? fullTitle }],
      ...(section ? { section } : {}),
      ...(publishedTime ? { publishedTime } : {}),
      ...(modifiedTime ? { modifiedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: desc,
      images: [ogImage],
      site: SITE.handle,
      creator: SITE.handle,
    },
    robots: noindex
      ? { index: false, follow: false, nocache: true }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
  };
}

/** Search intent the site should be legible for. Kept out of visible copy — no stuffing. */
export const CORE_KEYWORDS = [
  "REX KENNY",
  "REX KENNY Music",
  "REX KENNY Uganda",
  "REX KENNY Kasese",
  "African Dancehall Uganda",
  "Ugandan Dancehall Artist",
  "Ugandan Singer",
  "Ugandan Music Producer",
  "African Dancehall Music",
  "REX KENNY Songs",
  "REX KENNY Official Music Videos",
];
