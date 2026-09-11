"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { PasswordField } from "@/components/PasswordField";
import {
  parseRecoveryHash,
  STAFF_RECOVER_SESSION_API_PATH,
  STAFF_RESET_PASSWORD_API_PATH,
  validateStaffPassword,
} from "@/lib/staff/recovery";
import { STAFF_DASHBOARD_LOGIN_PATH } from "@/lib/staff/login-path";

export function StaffResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const search = new URLSearchParams(window.location.search);
        const hash = parseRecoveryHash(window.location.hash);
        const body: Record<string, string> = {};
        const code = search.get("code")?.trim() ?? "";
        const tokenHash = search.get("token_hash")?.trim() ?? "";
        const type = search.get("type")?.trim() ?? hash.type ?? "";

        if (code) body.code = code;
        if (tokenHash) {
          body.token_hash = tokenHash;
          body.type = type || "recovery";
        }
        if (hash.type === "recovery" && hash.accessToken && hash.refreshToken) {
          body.access_token = hash.accessToken;
          body.refresh_token = hash.refreshToken;
        }

        if (Object.keys(body).length === 0) {
          const sessionResponse = await fetch(STAFF_RECOVER_SESSION_API_PATH, {
            credentials: "same-origin",
          });
          if (!cancelled) {
            setReady(sessionResponse.ok);
            if (!sessionResponse.ok) {
              setError("This reset link is invalid or has expired. Request a new one.");
            }
          }
          return;
        }

        const response = await fetch(STAFF_RECOVER_SESSION_API_PATH, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(body),
        });
        if (hash.type === "recovery") {
          window.history.replaceState(null, "", window.location.pathname);
        }
        if (!cancelled) {
          setReady(response.ok);
          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
              error?: string;
            } | null;
            setError(
              payload?.error ??
                "This reset link is invalid or has expired. Request a new one.",
            );
          }
        }
      } catch {
        if (!cancelled) {
          setReady(false);
          setError("This reset link is invalid or has expired. Request a new one.");
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const valid = validateStaffPassword(password, confirm);
    if (!valid.ok) {
      setError(valid.error);
      return;
    }
    setError(null);
    setPending(true);
    try {
      const response = await fetch(STAFF_RESET_PASSWORD_API_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (response.ok && payload?.ok) {
        router.replace(`${STAFF_DASHBOARD_LOGIN_PATH}?reset=success`);
        router.refresh();
        return;
      }

      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError(
          payload?.error ?? "Could not update that password. Request a new reset link.",
        );
        setPending(false);
        return;
      }
      await supabase.auth.signOut();
      router.replace(`${STAFF_DASHBOARD_LOGIN_PATH}?reset=success`);
      router.refresh();
    } catch {
      setError("Could not update that password. Request a new reset link.");
      setPending(false);
    }
  }

  if (hydrating) {
    return <p className="text-sm text-muted">Checking your reset link…</p>;
  }

  if (!ready) {
    return (
      <div className="space-y-4">
        <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error ?? "This reset link is invalid or has expired. Request a new one."}
        </p>
        <Button href={STAFF_DASHBOARD_LOGIN_PATH}>Return to staff sign-in</Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PasswordField
        id="staff-new-password"
        label="New password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        minLength={8}
        className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 pr-12 text-sm text-ink outline-none ring-leaf-bright focus:ring-2"
      />
      <PasswordField
        id="staff-confirm-password"
        label="Confirm new password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        minLength={8}
        className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 pr-12 text-sm text-ink outline-none ring-leaf-bright focus:ring-2"
      />
      {error ? (
        <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Updating password…" : "Save new password"}
      </Button>
    </form>
  );
}
