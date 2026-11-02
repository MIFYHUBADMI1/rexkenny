"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import type { AdminFormState } from "@/lib/admin/form";

const IDLE: AdminFormState = { status: "idle", message: "" };

/**
 * Wraps a server action and shows exactly what it returned. The message area is
 * driven by the action's own state: it is empty until the action answers, and
 * there is no timed-out "looks like it worked" fallback anywhere in this file.
 */
export function AdminForm({
  action,
  children,
  submitLabel = "Save",
  footnote,
  className,
  resetKey,
}: {
  action: (prev: AdminFormState, fd: FormData) => Promise<AdminFormState>;
  children: React.ReactNode;
  submitLabel?: string;
  footnote?: React.ReactNode;
  className?: string;
  /**
   * Changing this remounts the form and clears the previous result. Pages pass
   * the row id, so switching records cannot leave last time's "Saved" hanging
   * over an unsaved form.
   */
  resetKey?: string;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);

  return (
    <form action={formAction} className={className ?? "space-y-5"} key={resetKey}>
      {children}

      {state.status !== "idle" ? (
        <p
          role="status"
          className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-sm leading-relaxed ${
            state.status === "ok"
              ? "border-gold/40 bg-gold/5 text-gold"
              : "border-blood/50 bg-blood/5 text-blood"
          }`}
        >
          {state.status === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          <span>{state.message}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn-gold" disabled={pending}>
          {pending ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Saving
            </span>
          ) : (
            submitLabel
          )}
        </button>
        {footnote ? <span className="text-xs text-smoke">{footnote}</span> : null}
      </div>
    </form>
  );
}
