"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { safeStaffNextPath } from "@/lib/staff/next-path";
import { STAFF_LOGIN_API_PATH } from "@/lib/staff/login-path";
import type { StaffLoginStage } from "@/lib/staff/login-stages";

export function StaffLoginForm({ nextPath = "/staff" }: { nextPath?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<StaffLoginStage | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStage(null);
    setPending(true);

    try {
      const response = await fetch(STAFF_LOGIN_API_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        stage?: StaffLoginStage;
        debug?: { stage?: StaffLoginStage };
      } | null;

      const nextStage = payload?.stage ?? payload?.debug?.stage ?? null;
      if (nextStage) setStage(nextStage);
      if (nextStage) {
        console.warn("[staff-login]", nextStage, payload?.debug ?? null);
      }

      if (!response.ok || !payload?.ok) {
        setError(
          payload?.error ??
            "Could not sign in. Check Supabase configuration and try again.",
        );
        setPending(false);
        return;
      }

      router.replace(safeStaffNextPath(nextPath));
      router.refresh();
    } catch {
      setError(
        "Could not sign in. Check Supabase configuration and try again.",
      );
      setStage("supabase_not_configured");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">
          Work email
        </span>
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none ring-leaf-bright focus:ring-2"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-ink">
          Password
        </span>
        <span className="relative block">
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 pr-12 text-sm text-ink outline-none ring-leaf-bright focus:ring-2"
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center px-3 text-muted hover:text-ink"
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </span>
      </label>

      {error ? (
        <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          <p>{error}</p>
          {stage ? (
            <p className="mt-1 text-xs text-muted">Internal stage: {stage}</p>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in to staff dashboard"}
      </Button>
    </form>
  );
}

function EyeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12 18 18.75 12 18.75 2.25 12 2.25 12Z"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3l18 18M10.6 10.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-4.4M6.1 6.4C4.2 7.7 2.8 9.6 2.25 12c0 0 3.75 6.75 9.75 6.75 1.5 0 2.9-.3 4.15-.85M9.9 5.4C10.57 5.2 11.27 5.25 12 5.25 18 5.25 21.75 12 21.75 12c-.3 1.1-.8 2.15-1.45 3.1"
      />
    </svg>
  );
}
