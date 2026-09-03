"use client";

import Link from "next/link";
import { useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { PRODUCT_NAME, PRODUCT_SUBTITLE } from "@/lib/brand";
import { PRIVACY_SUMMARY } from "@/lib/privacy/copy";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signUp(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        needsEmailConfirm?: boolean;
      };
      if (!response.ok) {
        setMessage(payload.error || "I couldn’t create that account. Please try again.");
        return;
      }
      setMessage(
        payload.needsEmailConfirm
          ? "Check your email to finish creating your account."
          : "Your free account is ready. You can return to your crop chat.",
      );
    } catch {
      setMessage("I’m having trouble with that right now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function oauth(provider: "google" | "apple") {
    setMessage(null);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        setMessage(
          provider === "google"
            ? "Google sign-in is not ready yet. Use email for now."
            : "Apple sign-in is not ready yet. Use email for now.",
        );
      }
    } catch {
      setMessage(
        provider === "google"
          ? "Google sign-in is not ready yet. Use email for now."
          : "Apple sign-in is not ready yet. Use email for now.",
      );
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <Link href="/" className="mb-6 flex items-center gap-2">
        <BrandLogo className="h-10 w-auto" />
        <span>
          <span className="block text-sm font-semibold text-canopy">{PRODUCT_NAME}</span>
          <span className="block text-xs text-muted">{PRODUCT_SUBTITLE}</span>
        </span>
      </Link>
      <h1 className="text-2xl font-semibold text-ink">Create a free account</h1>
      <p className="mt-2 text-sm text-muted">
        Save crop history, return to previous cases, keep photos, and get more usage.
        No phone number is required.
      </p>
      <form className="mt-6 space-y-3" onSubmit={signUp}>
        <label className="block text-sm font-medium text-ink">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl bg-surface px-3 ring-1 ring-line"
          />
        </label>
        <label className="block text-sm font-medium text-ink">
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 min-h-12 w-full rounded-xl bg-surface px-3 ring-1 ring-line"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="min-h-12 w-full rounded-full bg-canopy text-sm font-semibold text-white disabled:opacity-50"
        >
          Continue with email
        </button>
      </form>
      <div className="mt-4 space-y-2">
        <button
          type="button"
          onClick={() => void oauth("google")}
          className="min-h-12 w-full rounded-full bg-surface text-sm font-medium text-ink ring-1 ring-line"
        >
          Continue with Google
        </button>
        <button
          type="button"
          onClick={() => void oauth("apple")}
          className="min-h-12 w-full rounded-full bg-surface text-sm font-medium text-ink ring-1 ring-line"
        >
          Continue with Apple
        </button>
      </div>
      {message ? <p className="mt-4 text-sm text-ink">{message}</p> : null}
      <p className="mt-6 text-xs leading-relaxed text-muted">{PRIVACY_SUMMARY}</p>
      <p className="mt-3 text-sm">
        <Link href="/" className="text-canopy underline underline-offset-2">
          Back to chat
        </Link>
      </p>
    </main>
  );
}
