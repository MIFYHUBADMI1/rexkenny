"use client";

import { useActionState } from "react";
import { submitContact, type ContactState } from "@/actions/contact";

const initialState: ContactState = { status: "idle" };

export function ContactForm({
  kinds,
}: {
  kinds: { value: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(submitContact, initialState);

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="c-name" name="name" label="Your name" autoComplete="name" required />
        <Field
          id="c-org"
          name="organisation"
          label="Company / promoter (optional)"
          autoComplete="organization"
        />
        <Field id="c-email" name="email" label="Email" type="email" autoComplete="email" required />
        <Field id="c-phone" name="phone" label="Phone (optional)" type="tel" autoComplete="tel" />
      </div>

      <div>
        <label htmlFor="c-kind" className="block text-sm font-semibold text-mist">
          What is this about?
        </label>
        <select
          id="c-kind"
          name="kind"
          required
          defaultValue="booking"
          className="mt-2 w-full rounded-md border border-ash bg-ink px-4 py-3 text-sm focus:border-gold"
        >
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="c-date" className="block text-sm font-semibold text-mist">
            Event date (if a booking)
          </label>
          <input
            id="c-date"
            name="eventDate"
            type="date"
            className="mt-2 w-full rounded-md border border-ash bg-ink px-4 py-3 text-sm focus:border-gold"
          />
        </div>
        <Field id="c-budget" name="budget" label="Budget range (optional)" />
      </div>

      <div>
        <label htmlFor="c-message" className="block text-sm font-semibold text-mist">
          Details
        </label>
        <textarea
          id="c-message"
          name="message"
          required
          rows={6}
          aria-describedby="c-feedback"
          placeholder="Venue, city, expected audience, set length, links…"
          className="mt-2 w-full rounded-md border border-ash bg-ink px-4 py-3 text-sm placeholder:text-smoke focus:border-gold"
        />
      </div>

      {/* Honeypot: humans never see or fill this; bots that do are discarded. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="c-website">Leave this empty</label>
        <input id="c-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <button type="submit" disabled={pending} className="btn-gold disabled:opacity-60">
        {pending ? "Sending…" : "Send enquiry"}
      </button>

      <p id="c-feedback" role="status" aria-live="polite" className="text-sm">
        {state.status === "error" && (
          <span className="text-blood-bright">{state.message}</span>
        )}
        {state.status === "ok" && <span className="text-gold">{state.message}</span>}
      </p>
    </form>
  );
}

function Field({
  id,
  name,
  label,
  type = "text",
  required = false,
  autoComplete,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-mist">
        {label}
        {required && <span className="ml-1 text-blood-bright">*</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        className="mt-2 w-full rounded-md border border-ash bg-ink px-4 py-3 text-sm placeholder:text-smoke focus:border-gold"
      />
    </div>
  );
}
