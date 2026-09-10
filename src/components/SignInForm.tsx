"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { PRODUCT_NAME, PRODUCT_SUBTITLE } from "@/lib/brand";
import { PRIVACY_SUMMARY } from "@/lib/privacy/copy";

type Mode = "welcome" | "signup" | "login" | "otp";

export function SignInForm() {
  const router = useRouter();
  const search = useSearchParams();
  const initialMode = search.get("mode") === "login" ? "login" : "welcome";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [message, setMessage] = useState<string | null>(
    search.get("error") === "auth"
      ? "I couldn’t finish signing in. Please try again."
      : null,
  );
  const [pending, setPending] = useState(false);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [oauthNote, setOauthNote] = useState<string | null>(null);

  const otpValue = useMemo(() => code.join(""), [code]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/auth/providers");
        if (!response.ok) return;
        const payload = (await response.json()) as {
          google?: { configured?: boolean };
          apple?: { configured?: boolean };
        };
        if (!payload.google?.configured && !payload.apple?.configured) {
          setOauthNote(
            "Google and Apple sign-in still need a one-time company setup. Email works now.",
          );
        }
      } catch {
        // Email authentication still works if this lookup fails.
      }
    })();
  }, []);

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
        code?: string;
      };
      if (!response.ok) {
        setMessage(payload.error || "I couldn’t create that account. Please try again.");
        return;
      }
      if (payload.needsEmailConfirm) {
        setMode("otp");
        setMessage(null);
        return;
      }
      router.push("/");
    } catch {
      setMessage("I couldn’t complete that right now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function logIn(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) {
        setMessage(payload.error || "That email or password is not right.");
        return;
      }
      router.push("/");
    } catch {
      setMessage("I couldn’t complete that right now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(event?: React.FormEvent) {
    event?.preventDefault();
    if (otpValue.length !== 6 || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, token: otpValue }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) {
        setMessage(payload.error || "That code is not correct. Check it and try again.");
        return;
      }
      router.push("/");
    } catch {
      setMessage("I couldn’t complete that right now. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function resendCode() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        alreadyVerified?: boolean;
        message?: string;
      };
      if (payload.alreadyVerified) {
        setMode("login");
        setMessage(payload.message || "This email is already verified. You can log in.");
        return;
      }
      if (!response.ok) {
        setMessage(payload.error || "Please wait a moment before requesting another code.");
        return;
      }
      setMessage(payload.message || "We sent a new code.");
    } catch {
      setMessage("I couldn’t complete that right now. Please try again.");
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

  function handleOtpChange(index: number, value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length > 1) {
      const next = [...code];
      digits.slice(0, 6).split("").forEach((digit, offset) => {
        if (index + offset < 6) next[index + offset] = digit;
      });
      setCode(next);
      const focusAt = Math.min(5, index + digits.length);
      otpRefs.current[focusAt]?.focus();
      return;
    }
    const next = [...code];
    next[index] = digits.slice(-1);
    setCode(next);
    if (digits && index < 5) otpRefs.current[index + 1]?.focus();
  }

  function handleOtpKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !code[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  const heading =
    mode === "login"
      ? "Log in"
      : mode === "otp"
        ? "Check your email"
        : "Create a free account";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <Link href="/" className="mb-6 flex items-center gap-2">
        <BrandLogo className="h-10 w-auto" />
        <span>
          <span className="block text-sm font-semibold text-canopy">{PRODUCT_NAME}</span>
          <span className="block text-xs text-muted">{PRODUCT_SUBTITLE}</span>
        </span>
      </Link>
      <h1 className="text-2xl font-semibold text-ink">{heading}</h1>
      {mode === "welcome" || mode === "signup" ? (
        <p className="mt-2 text-sm text-muted">
          Save crop history, return to previous cases, keep photos, and get more usage.
          No phone number is required.
        </p>
      ) : null}
      {mode === "otp" ? (
        <p className="mt-2 text-sm text-muted">
          We sent a 6-digit code to {email || "your email"}.
        </p>
      ) : null}

      {mode === "welcome" ? (
        <div className="mt-6 space-y-3">
          <Link
            href="/"
            className="flex min-h-12 w-full items-center justify-center rounded-full bg-canopy text-sm font-semibold text-white"
          >
            Continue as Guest
          </Link>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setMessage(null);
            }}
            className="min-h-12 w-full rounded-full bg-surface text-sm font-semibold text-ink ring-1 ring-line"
          >
            Create Free Account
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setMessage(null);
            }}
            className="min-h-12 w-full rounded-full bg-surface text-sm font-medium text-canopy ring-1 ring-line"
          >
            Log In
          </button>
        </div>
      ) : null}

      {mode === "signup" ? (
        <form className="mt-6 space-y-3" onSubmit={signUp}>
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
            Create Free Account
          </button>
        </form>
      ) : null}

      {mode === "login" ? (
        <form className="mt-6 space-y-3" onSubmit={logIn}>
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
            Log In
          </button>
        </form>
      ) : null}

      {mode === "otp" ? (
        <form className="mt-6 space-y-4" onSubmit={verifyCode}>
          <div className="flex justify-between gap-2" role="group" aria-label="6-digit verification code">
            {code.map((digit, index) => (
              <input
                key={index}
                ref={(node) => {
                  otpRefs.current[index] = node;
                }}
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                aria-label={`Digit ${index + 1}`}
                maxLength={6}
                value={digit}
                onChange={(event) => handleOtpChange(index, event.target.value)}
                onKeyDown={(event) => handleOtpKeyDown(index, event)}
                className="h-12 w-11 rounded-xl bg-surface text-center text-lg font-semibold ring-1 ring-line"
              />
            ))}
          </div>
          <button
            type="submit"
            disabled={pending || otpValue.length !== 6}
            className="min-h-12 w-full rounded-full bg-canopy text-sm font-semibold text-white disabled:opacity-50"
          >
            Verify
          </button>
          <div className="flex flex-col gap-2 text-sm">
            <button
              type="button"
              disabled={pending}
              onClick={() => void resendCode()}
              className="min-h-11 text-canopy underline underline-offset-2 disabled:opacity-50"
            >
              Resend code
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setCode(["", "", "", "", "", ""]);
                setMessage(null);
              }}
              className="min-h-11 text-muted underline underline-offset-2"
            >
              Change email
            </button>
          </div>
        </form>
      ) : null}

      {mode !== "otp" ? (
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
          {oauthNote ? <p className="text-xs text-muted">{oauthNote}</p> : null}
        </div>
      ) : null}

      {message ? <p className="mt-4 text-sm text-ink" role="alert">{message}</p> : null}
      <p className="mt-6 text-xs leading-relaxed text-muted">{PRIVACY_SUMMARY}</p>
      <p className="mt-3 text-sm">
        <Link href="/" className="text-canopy underline underline-offset-2">
          Back to chat
        </Link>
      </p>
      {mode === "signup" ? (
        <p className="mt-3 text-sm text-muted">
          Already have an account?{" "}
          <button type="button" className="text-canopy underline" onClick={() => setMode("login")}>
            Log in
          </button>
        </p>
      ) : null}
      {mode === "login" ? (
        <p className="mt-3 text-sm text-muted">
          New here?{" "}
          <button type="button" className="text-canopy underline" onClick={() => setMode("signup")}>
            Create a free account
          </button>
        </p>
      ) : null}
    </main>
  );
}
