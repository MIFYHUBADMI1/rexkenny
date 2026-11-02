/**
 * Slugs are the public address of a release, track, video or post, and the
 * database validates them with public.is_valid_slug() (0001). This is the
 * TypeScript mirror of that rule.
 */
const VALID = /^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$/;

export function isValidSlug(value: string): boolean {
  return VALID.test(value);
}

/**
 * Fold a title into a slug. Non-latin characters are dropped rather than
 * transliterated, because a guessed transliteration would be an invention; the
 * caller checks the result and asks the admin for a slug when nothing is left.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
