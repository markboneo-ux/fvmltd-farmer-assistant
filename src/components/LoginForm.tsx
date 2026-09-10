"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FarmerOAuthButtons } from "@/components/FarmerOAuthButtons";
import { FarmerSubpage } from "@/components/FarmerSubpage";
import { PRIVACY_SUMMARY } from "@/lib/privacy/copy";
import { safeFarmerNextPath } from "@/lib/auth/paths";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeFarmerNextPath(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(
    searchParams.get("error") === "auth" ? "That sign-in link didn’t work. Please try again." : null,
  );
  const [pending, setPending] = useState(false);

  async function logIn(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, next }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string; next?: string };
      if (!response.ok) {
        setMessage(payload.error || "I couldn’t log you in. Please try again.");
        return;
      }
      router.replace(payload.next || next || "/");
      router.refresh();
    } catch {
      setMessage("I’m having trouble with that right now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function forgotPassword() {
    if (!email) {
      setMessage("Enter your email first, then tap Forgot password.");
      return;
    }
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) {
        setMessage(payload.error || "I couldn’t send that reset email.");
        return;
      }
      setMessage(payload.message || "If that email is registered, we sent a reset link.");
    } catch {
      setMessage("I’m having trouble with that right now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <FarmerSubpage
      title="Log in"
      subtitle="Save your crop cases and continue where you left off. Guest chat stays available."
    >
      <FarmerOAuthButtons next={next} onError={setMessage} />
      <form className="mt-5 space-y-3" onSubmit={logIn}>
        <label className="block text-sm font-medium text-ink">
          Email
          <input
            type="email"
            required
            autoComplete="username"
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
            autoComplete="current-password"
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
          Log in
        </button>
      </form>
      <button
        type="button"
        onClick={() => void forgotPassword()}
        className="mt-3 text-sm font-medium text-canopy underline underline-offset-2"
      >
        Forgot password
      </button>
      {message ? <p className="mt-4 text-sm text-ink">{message}</p> : null}
      <p className="mt-6 text-sm">
        <Link href="/signup" className="font-medium text-canopy underline underline-offset-2">
          Create account
        </Link>
      </p>
      <p className="mt-3 text-sm">
        <Link href="/" className="font-medium text-canopy underline underline-offset-2">
          Continue as Guest
        </Link>
      </p>
      <p className="mt-6 text-xs leading-relaxed text-muted">{PRIVACY_SUMMARY}</p>
    </FarmerSubpage>
  );
}
