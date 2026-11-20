"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SITE } from "@/lib/site";

export type AuthState =
  | { status: "idle" }
  | { status: "ok"; message: string; redirectTo?: string }
  | { status: "error"; message: string };

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.");

const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(200, "Passwords may not exceed 200 characters.");

/** Only same-origin paths may be a post-login destination. */
function safeNext(value: FormDataEntryValue | null): string {
  const raw = typeof value === "string" ? value : "";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return "/admin";
  return raw.slice(0, 200);
}

function offline(): AuthState {
  return {
    status: "error",
    message:
      "Sign-in is unavailable: accounts are not connected on this site yet. Please try again later.",
  };
}

/** Short-lived flag the Toaster reads once to show the welcome message. */
async function markWelcome(kind: "back" | "joined") {
  const store = await cookies();
  store.set("rk_welcome", kind, { path: "/", maxAge: 60, sameSite: "lax" });
}

export async function signInAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = z
    .object({ email: emailSchema, password: passwordSchema })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const sb = await createSupabaseServerClient();
  if (!sb) return offline();

  const { error } = await sb.auth.signInWithPassword(parsed.data);
  if (error) {
    // Supabase's own wording distinguishes "no such user" from "bad password"
    // when email enumeration protection is off. We surface it verbatim rather
    // than inventing a message, and never reveal anything about the account.
    return {
      status: "error",
      message:
        error.code === "invalid_credentials" || error.message.includes("Invalid login credentials")
          ? "That email and password do not match an account."
          : error.code === "email_not_confirmed"
            ? "Confirm your email address before signing in."
            : "Sign-in failed. Try again shortly.",
    };
  }

  await markWelcome("back");
  redirect(safeNext(formData.get("next")));
}

export async function signUpAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = z
    .object({
      email: emailSchema,
      password: passwordSchema,
      displayName: z.string().trim().min(2).max(60),
      // Honeypot: bots fill it, people never see it.
      website: z.string().max(0),
      // Deliberate, recorded consent to the privacy policy and terms.
      consent: z.literal(true, {
        errorMap: () => ({ message: "Please accept the privacy policy and terms." }),
      }),
    })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
      displayName: formData.get("displayName"),
      website: (formData.get("website") as string | null) ?? "",
      consent: formData.get("consent") === "on",
    });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  if (parsed.data.website.length > 0) {
    return { status: "ok", message: "Account created. Check your inbox to confirm it." };
  }

  const sb = await createSupabaseServerClient();
  if (!sb) return offline();

  const { data, error } = await sb.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${SITE.url}/auth/callback`,
      data: { display_name: parsed.data.displayName },
    },
  });
  if (error) return { status: "error", message: "Could not create that account. Try again." };

  // Supabase returns a user but no session until the address is confirmed. If
  // confirmation is disabled in the project the session is returned here, and
  // saying "check your inbox" when it never arrives would be a lie.
  if (data.session) {
    await markWelcome("joined");
    redirect("/admin");
  }

  return {
    status: "ok",
    message: "Account created. We sent a confirmation link — sign in after you click it.",
  };
}

export async function signInWithGoogleAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const sb = await createSupabaseServerClient();
  if (!sb) return offline();

  const redirectTo = `${SITE.url}/auth/callback?next=${encodeURIComponent(
    safeNext(formData.get("next")),
  )}`;

  const { data, error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, queryParams: { prompt: "select_account" } },
  });
  if (error || !data?.url) {
    return {
      status: "error",
      message:
        "Google sign-in is not configured on this project yet. Enable the Google provider in Supabase, then add your OAuth client ID and secret.",
    };
  }
  redirect(data.url);
}

export async function signOutAction(): Promise<void> {
  const sb = await createSupabaseServerClient();
  if (sb) await sb.auth.signOut();
  redirect("/");
}
