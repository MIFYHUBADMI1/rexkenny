"use client";

/**
 * Uses the browser's own print-to-PDF pipeline. Honest by design: there is no
 * server-side PDF renderer wired up, so the button says "print / save as PDF"
 * instead of claiming to download a generated file.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-gold print:hidden"
    >
      Print / save as PDF
    </button>
  );
}
