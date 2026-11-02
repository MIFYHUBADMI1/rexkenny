"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isEmailConfigured } from "@/lib/config";

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
      return { status: "ok", message: "You are already on the list — nothing duplicated." };
    }
    return { status: "error", message: "Could not save that address. Try again shortly." };
  }

  if (!isEmailConfigured) {
    return {
      status: "ok",
      message:
        "Saved. The confirmation email could not be sent yet — no email provider is configured.",
    };
  }

  return { status: "ok", message: "Check your inbox for a confirmation link." };
}
