"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/Button";
import { PasswordField } from "@/components/PasswordField";
import { safeStaffNextPath } from "@/lib/staff/next-path";
import {
  STAFF_DASHBOARD_HOME_PATH,
  STAFF_LOGIN_API_PATH,
} from "@/lib/staff/login-path";
import type { StaffLoginStage } from "@/lib/staff/login-stages";

type StaffLoginResponse = {
  ok?: boolean;
  error?: string;
  stage?: StaffLoginStage;
  debug?: {
    stage?: StaffLoginStage;
    supabaseHost?: string | null;
    vercelEnv?: string | null;
  };
};

export function StaffLoginForm({
  nextPath = STAFF_DASHBOARD_HOME_PATH,
}: {
  nextPath?: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [stageLine, setStageLine] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStageLine(null);
    setPending(true);

    try {
      const response = await fetch(STAFF_LOGIN_API_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const payload = (await response.json().catch(() => null)) as StaffLoginResponse | null;

      const nextStage = payload?.stage ?? payload?.debug?.stage ?? null;
      const debugBits = [
        nextStage,
        payload?.debug?.supabaseHost,
        payload?.debug?.vercelEnv,
      ].filter(Boolean);
      if (debugBits.length > 0) {
        setStageLine(debugBits.join(" · "));
        console.warn("[staff-login]", nextStage, payload?.debug ?? null);
      }

      if (!response.ok || !payload?.ok) {
        setError(payload?.error ?? "Could not sign in. Try again.");
        setPending(false);
        return;
      }

      window.location.assign(safeStaffNextPath(nextPath));
    } catch {
      setError("Could not sign in. Check the connection and try again.");
      setStageLine("supabase_not_configured");
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
      <PasswordField
        id="staff-password"
        label="Password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 pr-12 text-sm text-ink outline-none ring-leaf-bright focus:ring-2"
      />

      {error ? (
        <div className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          <p>{error}</p>
          {stageLine ? (
            <p className="mt-1 text-xs text-muted">Internal stage: {stageLine}</p>
          ) : null}
        </div>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in to staff dashboard"}
      </Button>
    </form>
  );
}
