"use client";

import { useState, useTransition } from "react";
import { Share2 } from "lucide-react";
import { toast } from "@/components/ui/Toaster";

/**
 * Share a page with fans. Uses the native share sheet where the device has
 * one (mobile, some desktops) and copies the absolute link everywhere else,
 * saying which happened — a silent clipboard write would leave the fan
 * guessing whether anything was shared.
 */
export function ShareButton({
  path,
  title,
  className,
}: {
  /** Site-relative path, e.g. /music/night-drive. */
  path: string;
  title: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const share = () =>
    startTransition(async () => {
      const url = `${window.location.origin}${path}`;
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ title, url });
          return;
        } catch {
          // Dismissed or failed — fall through to the clipboard copy.
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        toast("Link copied — paste it to a friend.");
        window.setTimeout(() => setCopied(false), 2500);
      } catch {
        toast("Could not copy the link — copy it from the address bar.");
      }
    });

  return (
    <button
      type="button"
      onClick={share}
      disabled={pending}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-full border border-ash px-4 py-2 text-sm font-semibold text-mist transition-colors hover:border-gold hover:text-gold disabled:opacity-60"
      }
    >
      <Share2 size={15} />
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
