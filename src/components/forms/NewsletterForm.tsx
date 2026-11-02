"use client";

import { useActionState } from "react";
import { submitNewsletter, type NewsletterState } from "@/actions/newsletter";

const initialState: NewsletterState = { status: "idle" };

export function NewsletterForm() {
  const [state, action, pending] = useActionState(submitNewsletter, initialState);

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="nl-email">
          Email address
        </label>
        <input
          id="nl-email"
          name="email"
          type="email"
          required
          inputMode="email"
          autoComplete="email"
          placeholder="you@email.com"
          aria-invalid={state.status === "error" || undefined}
          aria-describedby="nl-feedback"
          className="min-w-0 flex-1 rounded-full border border-ash bg-ink px-5 py-3 text-sm text-paper placeholder:text-smoke focus:border-gold"
        />
        <button type="submit" disabled={pending} className="btn-gold disabled:opacity-60">
          {pending ? "Adding…" : "Join"}
        </button>
      </div>

      {/* Honeypot: humans never see or fill this; bots that do are discarded. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="nl-website">Leave this empty</label>
        <input id="nl-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <p id="nl-feedback" role="status" aria-live="polite" className="text-xs">
        {state.status === "error" && <span className="text-blood-bright">{state.message}</span>}
        {state.status === "ok" && <span className="text-gold">{state.message}</span>}
        {state.status === "idle" && (
          <span className="text-smoke">Double opt-in: we send a confirmation link first.</span>
        )}
      </p>
    </form>
  );
}
