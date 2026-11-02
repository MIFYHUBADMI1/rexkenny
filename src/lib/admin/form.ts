import { z } from "zod";

/**
 * Shared plumbing for admin forms. Every action returns one of these states and
 * the page renders it verbatim — there is no "success" that hides a failure,
 * because a write that the database refused must be visible to the person who
 * attempted it.
 */
export type AdminFormState = {
  status: "idle" | "ok" | "error";
  message: string;
  /** The field to look at, when the failure has a single cause. */
  field?: string;
};

export const IDLE: AdminFormState = { status: "idle", message: "" };

export const ok = (message: string): AdminFormState => ({ status: "ok", message });
export const fail = (message: string, field?: string): AdminFormState => ({
  status: "error",
  message,
  field,
});

export const str = (fd: FormData, name: string): string => {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim() : "";
};

export const nullable = (v: string): string | null => (v.length > 0 ? v : null);

export const num = (fd: FormData, name: string): number | null => {
  const raw = str(fd, name);
  if (raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

export const bool = (fd: FormData, name: string): boolean => fd.get(name) === "on";

/** Comma or newline separated list -> Postgres text[]. Empty entries dropped. */
export const list = (fd: FormData, name: string): string[] =>
  str(fd, name)
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);

export function zodFail(error: z.ZodError): AdminFormState {
  const issue = error.issues[0];
  return fail(
    issue?.message ?? "Check the form.",
    issue?.path.length ? String(issue.path[0]) : undefined,
  );
}

/**
 * Turns a PostgREST/Postgres failure into something an artist can act on.
 * The database's own message is included: it is the truth about what was
 * refused, and rewording it into a generic "something went wrong" would hide
 * which constraint fired.
 */
export function databaseFail(error: {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}): AdminFormState {
  const message = error.message ?? "The database did not accept this change.";

  if (error.code === "23505" || /duplicate key/i.test(message)) {
    return fail(
      "That value is already used. Slugs and store links must be unique — the database refused the duplicate.",
      "slug",
    );
  }
  if (error.code === "23514" || /check constraint/i.test(message)) {
    const named = /constraint "([^"]+)"/i.exec(message)?.[1];
    return fail(
      named
        ? `The database rejected this combination of values (${named}). That constraint exists so an impossible or unproven state cannot be stored.`
        : "The database rejected this combination of values. A CHECK constraint guards the fields you changed.",
    );
  }
  if (error.code === "42501" || /row level security|permission denied/i.test(message)) {
    return fail(
      "Your role is not allowed to make this change. Authorisation is enforced by the database, not by this form.",
    );
  }
  if (error.code === "PGRST204" || /column .* does not exist/i.test(message)) {
    return fail(
      `The database schema does not match this screen (${message}). Apply the migrations in supabase/migrations.`,
    );
  }
  return fail(`${message}${error.hint ? ` — ${error.hint}` : ""}`);
}

/** Common validators, so a rule is stated once for every admin form. */
/**
 * Field-level checks that mirror the DDL's own CHECK regexes exactly. They run
 * server-side before the insert, so the admin gets a sentence instead of a
 * constraint name — and the database still has the final say.
 */
const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,78}[a-z0-9])?$/;
const ISRC_RE = /^[A-Z]{2}[A-Z0-9]{3}[0-9]{2}[0-9]{5}$/;
const UPC_RE = /^([0-9]{12}|[0-9]{14})$/;
const HTTP_RE = /^https?:\/\/\S+$/i;

export function checkSlug(value: string): string | null {
  if (value === "") return "A slug is required — it becomes the page address.";
  if (!SLUG_RE.test(value)) {
    return "Use lowercase letters, numbers and single hyphens, starting and ending with a letter or number.";
  }
  return null;
}

/** Empty is allowed for optional identifiers; a malformed one is not. */
export function checkIsrc(value: string): string | null {
  if (value === "" || ISRC_RE.test(value)) return null;
  return "An ISRC is 12 characters, for example UG1ABC2400001.";
}

export function checkUpc(value: string): string | null {
  if (value === "" || UPC_RE.test(value)) return null;
  return "A UPC/EAN is 12 or 14 digits.";
}

export function checkUrl(value: string): string | null {
  if (value === "" || HTTP_RE.test(value)) return null;
  return "Enter a full web address starting with https://.";
}

/** Returns the first complaint from a list, or null when everything passes. */
export function firstProblem(
  problems: (string | null)[],
): string | null {
  return problems.find((p): p is string => p !== null && p !== "") ?? null;
}

export const slugSchema = z
  .string()
  .trim()
  .regex(SLUG_RE, "Use lowercase letters, numbers and single hyphens, starting and ending with a letter or number.");

export const urlSchema = z
  .string()
  .trim()
  .regex(/^https?:\/\//i, "Only http and https links are accepted.")
  .refine((v) => {
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  }, "Enter a full URL including https://.");

