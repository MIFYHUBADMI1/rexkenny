"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type FavouriteState =
  | { status: "ok"; saved: boolean }
  | { status: "error"; message: string };

/**
 * Toggles a release in the signed-in fan's favourites. Row Level Security is
 * the enforcement: the insert policy only allows the caller's own rows and
 * only for releases that are actually public, so this action cannot be used
 * to favourite drafts or other people's lists.
 */
export async function toggleFavourite(
  releaseId: string,
): Promise<FavouriteState> {
  const sb = await createSupabaseServerClient();
  if (!sb) {
    return { status: "error", message: "Accounts are not available right now." };
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return { status: "error", message: "Sign in to save releases." };
  }

  const { data: existing } = await sb
    .from("fan_favourites")
    .select("release_id")
    .eq("user_id", user.id)
    .eq("release_id", releaseId)
    .maybeSingle();

  if (existing) {
    const { error } = await sb
      .from("fan_favourites")
      .delete()
      .eq("user_id", user.id)
      .eq("release_id", releaseId);
    if (error) return { status: "error", message: "Could not update favourites." };
    await sb.from("fan_activity").insert({
      user_id: user.id,
      action: "remove_favourite",
      entity_type: "release",
      entity_id: releaseId,
    });
    return { status: "ok", saved: false };
  }

  const { error } = await sb
    .from("fan_favourites")
    .insert({ user_id: user.id, release_id: releaseId });
  if (error) {
    return {
      status: "error",
      message:
        error.code === "42501"
          ? "That release cannot be saved."
          : "Could not save that release. Try again.",
    };
  }
  await sb.from("fan_activity").insert({
    user_id: user.id,
    action: "add_favourite",
    entity_type: "release",
    entity_id: releaseId,
  });
  return { status: "ok", saved: true };
}
