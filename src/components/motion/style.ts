import type { CSSProperties } from "react";

/**
 * CSS custom properties in a style object are not typed as known keys, and the
 * motion layer sets several. One cast here beats four per file.
 */
export const motionVars = (vars: Record<string, string | number>): CSSProperties =>
  vars as CSSProperties;
