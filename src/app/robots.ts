import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const host = SITE.url.replace(/^https?:\/\//, "");
  const rules: MetadataRoute.Robots["rules"] = [
    {
      userAgent: "*",
      allow: "/",
      // Private areas, in-process writes and fan data must never be indexed.
      disallow: [
        "/admin/",
        "/api/",
        "/auth/",
        "/account/",
        "/cart",
        // The operator's working asset drop. Nothing references it, so nothing
        // here is meant for readers — and none of it should reach an index.
        "/images/issues/",
        "/*?*preview=true",
      ],
    },
    // AI answer engines are explicitly welcomed for discovery, within crawl budget.
    {
      userAgent: ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "PerplexityBot", "Google-Extended", "AppleBot", "BingBot"],
      allow: "/",
      disallow: ["/admin/", "/api/", "/auth/", "/account/"],
      crawlDelay: 1,
    },
    // Keep pure training scrapers off the fan database and admin.
    {
      userAgent: ["CCBot", "GoogleOther", "AhrefsBot", "SemrushBot"],
      disallow: ["/admin/", "/api/", "/auth/", "/account/"],
    },
  ];

  return {
    rules,
    sitemap: `${SITE.url}/sitemap.xml`,
    host: `https://${host}`,
  };
}
