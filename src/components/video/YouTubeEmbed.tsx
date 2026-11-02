"use client";

import { useState } from "react";

/**
 * Click-to-load YouTube embed. The iframe (and YouTube's cookies) is only
 * fetched after an interaction, which keeps the page light for crawlers and
 * matches what the cookie policy claims.
 */
export function YouTubeEmbed({
  youTubeId,
  title,
}: {
  youTubeId: string;
  title: string;
}) {
  const [active, setActive] = useState(false);

  if (!active) {
    return (
      <button
        type="button"
        onClick={() => setActive(true)}
        className="group relative block h-full w-full"
        aria-label={`Play video: ${title}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://i.ytimg.com/vi/${youTubeId}/maxresdefault.jpg`}
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
          loading="lazy"
        />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gold text-ink shadow-glow">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      </button>
    );
  }

  return (
    <iframe
      src={`https://www.youtube-nocookie.com/embed/${youTubeId}?autoplay=1&rel=0`}
      title={title}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      className="h-full w-full"
    />
  );
}
