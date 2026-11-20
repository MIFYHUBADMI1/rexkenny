"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Heart, Info } from "lucide-react";

export type Toast = { id: number; message: string; kind: "ok" | "info" };

const EVENT = "rk:toast";
let counter = 0;

/** Fire a toast from any client component. Safe to call anywhere. */
export function toast(message: string, kind: Toast["kind"] = "ok") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, kind } }));
}

const WELCOME_COOKIE = "rk_welcome";

/**
 * Global notification toasts + the post-sign-in welcome message. Mounted once
 * in the root layout. The welcome flag is a short-lived cookie set by the
 * sign-in actions and the OAuth callback, so it survives the redirect and is
 * shown exactly once.
 */
export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<{ message: string; kind?: Toast["kind"] }>).detail;
      if (!detail?.message) return;
      const id = ++counter;
      setItems((list) => [...list, { id, message: detail.message, kind: detail.kind ?? "ok" }]);
      setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 4500);
    };
    window.addEventListener(EVENT, onToast);

    // One-time welcome after any successful sign-in / registration / OAuth.
    const match = document.cookie.match(new RegExp(`(?:^|; )${WELCOME_COOKIE}=([^;]*)`));
    if (match) {
      const kind = match[1];
      const message =
        kind === "joined"
          ? "Welcome to the fan club — your account is ready."
          : "Welcome back — good to see you.";
      onToast(new CustomEvent(EVENT, { detail: { message, kind: "ok" } }));
      document.cookie = `${WELCOME_COOKIE}=; path=/; max-age=0`;
    }

    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[min(24rem,calc(100vw-2.5rem))] flex-col gap-2"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-3 rounded-lg border border-gold/40 bg-ink-raised px-4 py-3 shadow-xl"
        >
          {t.kind === "ok" ? (
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-gold" />
          ) : t.message.toLowerCase().includes("favourite") ? (
            <Heart size={18} className="mt-0.5 shrink-0 text-gold" fill="currentColor" />
          ) : (
            <Info size={18} className="mt-0.5 shrink-0 text-gold" />
          )}
          <p className="text-sm leading-snug text-mist">{t.message}</p>
        </div>
      ))}
    </div>
  );
}
</invoke>