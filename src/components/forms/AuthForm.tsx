"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  signInAction,
  signInWithGoogleAction,
  signUpAction,
  type AuthState,
} from "@/actions/auth";

const idle: AuthState = { status: "idle" };

export function AuthForm({
  mode,
  next,
  googleAvailable,
}: {
  mode: "login" | "register";
  next: string;
  googleAvailable: boolean;
}) {
  const isLogin = mode === "login";
  const [state, action, pending] = useActionState(
    isLogin ? signInAction : signUpAction,
    idle,
  );
  const [googleState, googleAction, googlePending] = useActionState(
    signInWithGoogleAction,
    idle,
  );

  return (
    <div className="mt-8 space-y-6">
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next} />

        <div>
          <label htmlFor="auth-email" className="block text-sm text-mist">
            Email address
          </label>
          <input
            id="auth-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            className="mt-2 w-full rounded-md border border-ash bg-ink px-4 py-3 text-sm placeholder:text-smoke focus:border-gold"
          />
        </div>

        {!isLogin && (
          <div>
            <label htmlFor="auth-name" className="block text-sm text-mist">
              Display name
            </label>
            <input
              id="auth-name"
              name="displayName"
              type="text"
              required
              minLength={2}
              maxLength={60}
              autoComplete="name"
              className="mt-2 w-full rounded-md border border-ash bg-ink px-4 py-3 text-sm placeholder:text-smoke focus:border-gold"
            />
          </div>
        )}

        <div>
          <label htmlFor="auth-password" className="block text-sm text-mist">
            Password
          </label>
          <input
            id="auth-password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={isLogin ? "current-password" : "new-password"}
            className="mt-2 w-full rounded-md border border-ash bg-ink px-4 py-3 text-sm placeholder:text-smoke focus:border-gold"
          />
          {!isLogin && (
            <p className="mt-2 text-xs text-smoke">At least 8 characters. Nothing is stored in plain text.</p>
          )}
        </div>

        {!isLogin && (
          <>
            {/* Honeypot: humans never see or fill this; bots that do are discarded. */}
            <div
              aria-hidden="true"
              className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
            >
              <label htmlFor="auth-website">Leave this empty</label>
              <input id="auth-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
            </div>

            <label className="flex items-start gap-3 text-sm text-mist">
              <input
                type="checkbox"
                name="consent"
                required
                className="mt-1 h-4 w-4 accent-[#d4a52c]"
              />
              <span>
                I have read the{" "}
                <Link href="/privacy-policy" className="text-gold underline decoration-charcoal underline-offset-4">
                  privacy policy
                </Link>{" "}
                and the{" "}
                <Link href="/terms-of-service" className="text-gold underline decoration-charcoal underline-offset-4">
                  terms of service
                </Link>
                .
              </span>
            </label>
          </>
        )}

        <button type="submit" disabled={pending} className="btn-gold w-full disabled:opacity-60">
          {pending
            ? isLogin
              ? "Signing in…"
              : "Creating account…"
            : isLogin
              ? "Sign in"
              : "Create account"}
        </button>

        <p role="status" aria-live="polite" className="text-sm">
          {state.status === "error" && <span className="text-blood-bright">{state.message}</span>}
          {state.status === "ok" && <span className="text-gold">{state.message}</span>}
        </p>
      </form>

      {googleAvailable && (
        <form action={googleAction}>
          <input type="hidden" name="next" value={next} />
          <button
            type="submit"
            disabled={googlePending}
            className="btn-ghost w-full disabled:opacity-60"
          >
            {googlePending ? "Opening Google…" : "Continue with Google"}
          </button>
          <p role="status" aria-live="polite" className="mt-2 text-xs text-smoke">
            {googleState.status === "error" && <span className="text-blood-bright">{googleState.message}</span>}
          </p>
        </form>
      )}

      <p className="text-sm text-smoke">
        {isLogin ? (
          <>
            No account yet?{" "}
            <Link href={`/auth/register?next=${encodeURIComponent(next)}`} className="text-gold">
              Create one
            </Link>
          </>
        ) : (
          <>
            Already registered?{" "}
            <Link href={`/auth/login?next=${encodeURIComponent(next)}`} className="text-gold">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
