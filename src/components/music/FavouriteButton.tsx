"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { toggleFavourite } from "@/actions/favourites";
import { toast } from "@/components/ui/Toaster";

/**
 * Save/unsave button for a release. Signed-out visitors get a link to sign in
 * (with a return path); signed-in fans toggle immediately. The saved state is
 * seeded server-side so there is no flash of the wrong icon.
 */
export function FavouriteButton({
  releaseId,
  releaseSlug,
  initialSaved,
  signedIn,
}: {
  releaseId: string;
  releaseSlug: string;
  initialSaved: boolean;
  signedIn: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!signedIn) {
    return (
      <Link
        href={`/auth/login?next=${encodeURIComponent(`/music/${releaseSlug}`)}`}
        className="inline-flex items-center gap-2 rounded-full border border-ash px-4 py-2 text-sm font-semibold text-mist transition-colors hover:border-gold hover:text-gold"
      >
        <Heart size={15} /> Save to favourites
      </Link>
    );
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await toggleFavourite(releaseId);
            if (result.status === "ok") {
              setSaved(result.saved);
              toast(
                result.saved
                  ? "Saved to your favourites — find it under Account."
                  : "Removed from your favourites.",
              );
            } else {
              setError(result.message);
            }
          })
        }
        aria-pressed={saved}
        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
          saved
            ? "border-gold bg-gold/10 text-gold"
            : "border-ash text-mist hover:border-gold hover:text-gold"
        }`}
      >
        <Heart size={15} fill={saved ? "currentColor" : "none"} />
        {saved ? "Saved to favourites" : "Save to favourites"}
      </button>
      {error && <span className="text-xs text-blood-bright">{error}</span>}
    </span>
  );
}
