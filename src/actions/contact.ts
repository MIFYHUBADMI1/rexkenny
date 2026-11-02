"use server";

import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ContactState =
  | { status: "idle" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

const schema = z.object({
  name: z.string().trim().min(2, "Tell us who you are."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  organisation: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
  kind: z.enum([
    "booking",
    "event-appearance",
    "collaboration",
    "production",
    "beat-licence",
    "press",
    "business",
  ]),
  eventDate: z.string().trim().max(32).optional(),
  budget: z.string().trim().max(80).optional(),
  message: z.string().trim().min(10, "Add a little more detail (10 characters minimum)."),
  website: z.string().max(0),
});

const RATE_WINDOW_SECONDS = 60;
const RATE_MAX = 3;

export async function submitContact(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const raw = Object.fromEntries(formData.entries());
  const parsed = schema.safeParse({
    ...raw,
    organisation: raw.organisation || "",
    phone: raw.phone || "",
    eventDate: raw.eventDate || "",
    budget: raw.budget || "",
    website: raw.website || "",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Please check the form and try again.",
    };
  }

  // Honeypot filled -> pretend success, store nothing, never reveal the filter.
  if (parsed.data.website.length > 0) {
    return { status: "ok", message: "Thanks — your enquiry has been sent." };
  }

  const sb = await createSupabaseServerClient();
  if (!sb) {
    return {
      status: "error",
      message:
        "This form cannot save right now: Supabase is not connected. Your enquiry was NOT sent.",
    };
  }

  const ip = await clientIp();

  // The throttle has to run server-side in the database: anonymous visitors are
  // given no SELECT on contact_submissions at all (RLS), so counting rows from
  // here would silently return zero and never rate-limit anybody. The
  // SECURITY DEFINER function answers the one question we need without opening
  // the table.
  const { data: throttled, error: throttleError } = await sb.rpc(
    "contact_submission_is_throttled",
    { p_ip_hash: ip, p_window_seconds: RATE_WINDOW_SECONDS, p_max: RATE_MAX },
  );

  if (throttleError) {
    return {
      status: "error",
      message: "This form cannot be checked for abuse right now. Please try again shortly.",
    };
  }
  if (throttled === true) {
    return {
      status: "error",
      message: "Too many enquiries at once. Please wait a minute and try again.",
    };
  }

  const d = parsed.data;
  const { error } = await sb.from("contact_submissions").insert({
    full_name: d.name,
    email: d.email,
    phone: d.phone || null,
    organisation: d.organisation || null,
    kind: d.kind,
    event_date: d.eventDate || null,
    budget: d.budget || null,
    message: d.message,
    ip_hash: ip,
    status: "new",
  });

  if (error) {
    return { status: "error", message: "Could not save your enquiry. Try again shortly." };
  }

  return {
    status: "ok",
    message: "Sent. It lands in the artist's enquiries queue — no auto-reply is promised.",
  };
}

/**
 * Salted SHA-256 of the caller's IP. The raw address is never stored —
 * only this digest, which is enough to throttle repeat sends while keeping
 * the record outside the scope of personal-data retention rules.
 */
async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = (forwarded?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();

  // Without a secret salt the digest is predictable per-IP, so it only ever
  // gates abuse; it is never treated as a pseudonym for an identified person.
  const salt = process.env.IP_SALT ?? "rex-kenny-music";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
