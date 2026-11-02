import { env } from "@/lib/config";

/**
 * Single source of truth for artist/site identity.
 * Everything SEO-related (metadata, JSON-LD, UI chrome) reads from here.
 * Edit values here or through the admin CMS — never hard-code them in pages.
 */
export const SITE = {
  name: "REX KENNY Music",
  legalName: "REX KENNY MUSIC",
  shortName: "REX KENNY",
  handle: "@rexkennymusic",
  artist: "REX KENNY",
  role: "African Dancehall Artist",
  roles: [
    "African Dancehall Artist",
    "Singer",
    "Rapper",
    "Songwriter",
    "Music Producer",
    "Beatmaker",
  ] as string[],
  tagline: "From Kasese, Uganda to the World.",
  url: env.siteUrl.replace(/\/$/, ""),
  locale: "en_UG",
  city: "Kasese",
  country: "Uganda",
  countryName: "Republic of Uganda",
  title:
    "REX KENNY Music | African Dancehall Artist & Producer from Uganda",
  description:
    "Official website of REX KENNY — African Dancehall artist, singer, songwriter, rapper and producer from Kasese, Uganda. Listen to music, watch videos, read lyrics, book performances and download the press kit.",
  ogImage: "/images/og/rex-kenny-1200x630.jpg",
  gscToken: process.env.NEXT_PUBLIC_GSC_SITE_VERIFICATION || "",
  gaId: process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID || "",
} as const;

export const NAV: readonly { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/music", label: "Music" },
  { href: "/videos", label: "Videos" },
  { href: "/about", label: "About" },
  { href: "/lyrics", label: "Lyrics" },
  { href: "/news", label: "News" },
  { href: "/epk", label: "EPK" },
  { href: "/contact", label: "Contact" },
];

/**
 * Social profiles. Leave a URL empty until the real profile exists —
 * empty links are never rendered and never enter structured data,
 * so we don't point search engines at URLs that don't exist.
 */
export const SOCIALS: { platform: string; url: string }[] = [
  { platform: "YouTube", url: "" },
  { platform: "Instagram", url: "" },
  { platform: "TikTok", url: "" },
  { platform: "Facebook", url: "" },
  { platform: "X", url: "" },
  { platform: "Spotify", url: "" },
  { platform: "Apple Music", url: "" },
  { platform: "Audiomack", url: "" },
  { platform: "Boomplay", url: "" },
];

export const sameAs = SOCIALS.filter((s) => s.url.length > 0).map((s) => s.url);
