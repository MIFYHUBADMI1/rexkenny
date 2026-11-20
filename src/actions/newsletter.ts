"use server";

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isEmailConfigured } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { SITE } from "@/lib/site";

export type NewsletterState =
  | { status: "idle" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  // Honeypot: real people never fill this, bots do. A filled form returns a
  // convincing success and stores nothing.
  website: z.string().max(0),
});

function confirmationEmailHtml(link: string): string {
  return [
    `<p>Hi,</p>`,
    `<p>You asked to join the ${SITE.legalName} fan list. Confirm your address by clicking the button below:</p>`,
    `<p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#c9a227;color:#0d0d0f;border-radius:999px;text-decoration:none;font-weight:bold">Confirm my subscription</a></p>`,
    `<p style="color:#666;font-size:13px">Or paste this link into your browser:<br>${link}</p>`,
    `<p style="color:#666;font-size:13px">If you did not request this, ignore this email — the address stays unconfirmed and receives nothing.</p>`,
    `<p>— ${SITE.shortName}</p>`,
  ].join("\n");
}

/**
 * Issues a fresh single-use token, stores only its SHA-256 hash (the raw token
 * exists solely inside the email), and sends the confirmation link. Returns a
 * user-facing outcome; never throws.
 */
async function queueConfirmation(
  email: string,
): Promise<"sent" | "no-provider" | "no-admin" | "failed"> {
  if (!isEmailConfigured) return "no-provider";
  const admin = createSupabaseAdminClient();
  if (!admin) return "no-admin";

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { data: updated, error } = await admin
    .from("newsletter_subscribers")
    .update({
      verify_token_hash: tokenHash,
      verify_sent_at: new Date().toISOString(),
    })
    .eq("email", email)
    .eq("status", "pending")
    .select("id");
  // No pending row means the address is already confirmed (or gone) — a
  // token written nowhere would email a link that can never work.
  if (error || !updated || updated.length === 0) return "failed";

  const link = `${SITE.url}/newsletter/confirm?token=${token}`;
  const result = await sendEmail({
    to: email,
    subject: `Confirm your ${SITE.shortName} subscription`,
    text: [
      `You asked to join the ${SITE.legalName} fan list.`,
      ``,
      `Confirm your address here: ${link}`,
      ``,
      `If you did not request this, ignore this email — the address stays`,
      `unconfirmed and receives nothing.`,
      ``,
      `— ${SITE.shortName}`,
    ].join("\n"),
    html: confirmationEmailHtml(link),
  });
  return result.ok ? "sent" : "failed";
}

export async function submitNewsletter(
  _prev: NewsletterState,
  formData: FormData,
): Promise<NewsletterState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    website: (formData.get("website") as string | null) ?? "",
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Invalid email." };
  }

  if (parsed.data.website.length > 0) {
    return { status: "ok", message: "Thanks — you're on the list." };
  }

  const sb = await createSupabaseServerClient();
  if (!sb) {
    return {
      status: "error",
      message: "Signup is offline: Supabase is not connected, so nothing was stored.",
    };
  }

  const email = parsed.data.email;

  // RLS allows anonymous insert into this table only; see the
  // newsletter_subscribers insert policy. The row lands as 'pending' with the
  // consent timestamp — never confirmed_at, because confirmation has not
  // happened yet and marketing sends must filter on that column.
  const { error } = await sb.from("newsletter_subscribers").insert({
    email,
    status: "pending",
    consent_recorded_at: new Date().toISOString(),
    source: "site",
  });

  if (error) {
    if (error.code === "23505") {
      // Already on the list: if it is still pending, a fresh confirmation
      // email is the helpful response rather than a dead end.
      const outcome = await queueConfirmation(email);
      if (outcome === "sent") {
        return { status: "ok", message: "You're already on the list — we re-sent the confirmation link." };
      }
      return { status: "ok", message: "You are already on the list — nothing duplicated." };
    }
    return { status: "error", message: "Could not save that address. Try again shortly." };
  }

  const outcome = await queueConfirmation(email);
  switch (outcome) {
    case "sent":
      return { status: "ok", message: "Check your inbox for a confirmation link." };
    case "no-provider":
      return {
        status: "ok",
        message:
          "Saved. The confirmation email could not be sent yet — no email provider is configured.",
      };
    case "no-admin":
      return {
        status: "ok",
        message:
          "Saved. The confirmation email needs the Supabase service role key configured on the server.",
      };
    default:
      return {
        status: "ok",
        message:
          "Saved, but the confirmation email could not be sent — try again shortly.",
      };
  }
}
