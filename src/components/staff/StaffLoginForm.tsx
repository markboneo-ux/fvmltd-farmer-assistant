"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/Button";
import { safeStaffNextPath } from "@/lib/staff/next-path";

export function StaffLoginForm({ nextPath = "/staff" }: { nextPath?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError("Invalid email or password.");
        setPending(false);
        return;
      }

      const me = await fetch("/api/staff/me");
      if (!me.ok) {
        await supabase.auth.signOut();
        const payload = (await me.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          payload?.error ??
            "This account is not an active FVMLTD staff member.",
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
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none ring-leaf-bright focus:ring-2"
        />
      </label>

      {error ? (
        <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in to staff dashboard"}
      </Button>
    </form>
  );
}
