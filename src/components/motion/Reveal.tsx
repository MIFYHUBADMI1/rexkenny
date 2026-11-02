"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Reveals a block as it scrolls into view.
 *
 * The hidden state is never in the server HTML: script adds it after mount and
 * only for blocks still below the viewport, so a crawler, a reader with JS off,
 * and a slow connection all see finished content. Blocks already on screen at
 * mount are left exactly as they arrived — no flicker, no re-animation.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  distance = 18,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Milliseconds. Staggers siblings so a grid arrives in reading order. */
  delay?: number;
  distance?: number;
  as?: "div" | "li" | "article" | "section";
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A hidden document never delivers intersection callbacks, so arming a
    // reveal there would leave the content invisible until the tab is focused.
    if (document.hidden) return;
    if (!("IntersectionObserver" in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    el.classList.add("rk-hidden");
    el.style.setProperty("--rk-delay", `${delay}ms`);
    el.style.setProperty("--rk-y", `${distance}px`);

    const seen = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("rk-shown");
          seen.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.01 },
    );
    seen.observe(el);
    return () => seen.disconnect();
  }, [delay, distance]);

  return (
    <Tag ref={ref as never} className={className}>
      {children}
    </Tag>
  );
}
