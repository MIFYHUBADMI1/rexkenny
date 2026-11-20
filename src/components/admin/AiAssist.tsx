"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import {
  draftReleaseCopyAction,
  draftReleaseSeoAction,
  type AiResult,
} from "@/actions/ai";

/**
 * "Draft with AI" controls for the release forms. They live inside the form
 * they fill, read the current field values through FormData, call the server
 * action, and write the result back into the inputs — nothing is saved until
 * the admin presses the form's own save button, and every draft is theirs to
 * edit or discard.
 */

function useAiDraft() {
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const report = (r: AiResult<unknown>) => {
    setMessage(
      r.ok
        ? { ok: true, text: "Draft written into the fields below — read it before saving." }
        : { ok: false, text: r.message },
    );
    return r.ok;
  };

  return { pending, startTransition, notes, setNotes, message, setMessage, report };
}

function readFormFields(form: HTMLFormElement): FormData {
  return new FormData(form);
}

function setField(form: HTMLFormElement, name: string, value: string) {
  const el = form.elements.namedItem(name);
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function AssistShell({
  pending,
  notes,
  setNotes,
  message,
  onDraft,
  buttonLabel,
  hint,
}: {
  pending: boolean;
  notes: string;
  setNotes: (v: string) => void;
  message: { ok: boolean; text: string } | null;
  onDraft: (form: HTMLFormElement, notes: string) => void;
  buttonLabel: string;
  hint: string;
}) {
  return (
    <div className="rounded-md border border-gold/30 bg-gold/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-paper">
        <Sparkles className="h-4 w-4 text-gold" aria-hidden />
        Draft with AI
      </p>
      <p className="mt-1 text-xs leading-relaxed text-smoke">{hint}</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes, e.g. “mention the club influence”"
          className="w-full rounded-md border border-ash bg-ink px-3 py-2 text-sm text-paper placeholder:text-smoke/70 focus:border-gold focus:outline-none"
          maxLength={1000}
        />
        <button
          type="button"
          disabled={pending}
          onClick={(e) => {
            const form = e.currentTarget.closest("form");
            if (form) onDraft(form, notes);
          }}
          className="btn-ghost shrink-0 border-gold/40 text-gold"
        >
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Drafting
            </span>
          ) : (
            buttonLabel
          )}
        </button>
      </div>
      {message ? (
        <p
          role="status"
          className={`mt-3 text-xs leading-relaxed ${message.ok ? "text-gold" : "text-blood"}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

/** Sits inside the release details form and fills description + artwork alt. */
export function ReleaseCopyAssist() {
  const { pending, startTransition, notes, setNotes, message, report } = useAiDraft();

  return (
    <AssistShell
      pending={pending}
      notes={notes}
      setNotes={setNotes}
      message={message}
      buttonLabel="Draft description & alt text"
      hint="Reads the title, genre and language already in this form and writes a first draft. You review and edit before saving — nothing is stored by the AI."
      onDraft={(form, noteText) => {
        const fd = readFormFields(form);
        startTransition(async () => {
          const r = await draftReleaseCopyAction({
            title: String(fd.get("title") ?? ""),
            releaseType: String(fd.get("release_type") ?? ""),
            genre: String(fd.get("genre") ?? ""),
            subgenre: String(fd.get("subgenre") ?? "") || undefined,
            language: String(fd.get("language") ?? "") || undefined,
            notes: noteText || undefined,
          });
          if (report(r) && "description" in r) {
            if (r.description) setField(form, "description", r.description);
            if (r.artworkAlt) setField(form, "artwork_alt", r.artworkAlt);
          }
        });
      }}
    />
  );
}

/** Sits inside the Search appearance form and fills the two SEO text fields. */
export function SeoCopyAssist({
  title,
  releaseType,
  genre,
  description,
  slug,
}: {
  title: string;
  releaseType: string;
  genre: string;
  description?: string | null;
  slug?: string;
}) {
  const { pending, startTransition, notes, setNotes, message, report } = useAiDraft();

  return (
    <AssistShell
      pending={pending}
      notes={notes}
      setNotes={setNotes}
      message={message}
      buttonLabel="Draft search title & description"
      hint="Writes a search snippet sized for results pages. The site still appends its own brand suffix, and empty fields keep their generated fallbacks."
      onDraft={(form) => {
        startTransition(async () => {
          const r = await draftReleaseSeoAction({
            title,
            releaseType,
            genre,
            description: description ?? undefined,
            slug,
          });
          if (report(r) && "seoTitle" in r) {
            setField(form, "seo_title", r.seoTitle);
            setField(form, "seo_description", r.seoDescription);
          }
        });
      }}
    />
  );
}
