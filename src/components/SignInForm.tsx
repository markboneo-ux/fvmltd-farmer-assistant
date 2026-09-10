"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FarmerOAuthButtons } from "@/components/FarmerOAuthButtons";
import { FarmerSubpage } from "@/components/FarmerSubpage";
import { PRIVACY_SUMMARY } from "@/lib/privacy/copy";

export function SignInForm() {
  const router = useRouter();
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
      if (payload.needsEmailConfirm) {
        setMessage("Check your email to finish creating your account.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setMessage("I’m having trouble with that right now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <FarmerSubpage
      title="Create a free account"
      subtitle="Keep crop history, photos, and follow-ups. No long profile is needed before you chat."
    >
      <FarmerOAuthButtons onError={setMessage} />
      <form className="mt-5 space-y-3" onSubmit={signUp}>
        <label className="block text-sm font-medium text-ink">
          Email
          <input
            type="email"
            required
            autoComplete="email"
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
            autoComplete="new-password"
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
          Create free account
        </button>
      </form>
      {message ? <p className="mt-4 text-sm text-ink">{message}</p> : null}
      <p className="mt-6 text-sm">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-canopy underline underline-offset-2">
          Log in
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
