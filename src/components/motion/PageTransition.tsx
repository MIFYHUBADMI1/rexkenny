"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Keying the wrapper to the pathname remounts it on navigation, which restarts
 * the CSS fade in globals.css. App Router swaps content without a document
 * load, and without this the change of page reads as a hard cut.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return <div key={usePathname()} className="rk-page">{children}</div>;
}
