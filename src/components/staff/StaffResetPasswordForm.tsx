"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { PasswordField } from "@/components/PasswordField";
import {
  detectRecoveryLinkFormat,
  recoveryHydrateBodyFromLocation,
  recoveryUserError,
  STAFF_RECOVER_SESSION_API_PATH,
  STAFF_RESET_PASSWORD_API_PATH,
  validateStaffPassword,
  type RecoveryLinkFormat,
} from "@/lib/staff/recovery";
import { STAFF_DASHBOARD_LOGIN_PATH } from "@/lib/staff/login-path";

type Phase = "inspecting" | "confirm" | "ready" | "invalid";

export function StaffResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [phase, setPhase] = useState<Phase>("inspecting");
  const [format, setFormat] = useState<RecoveryLinkFormat>("none");

  useEffect(() => {
    let cancelled = false;

    async function inspect() {
      try {
        const search = new URLSearchParams(window.location.search);
        const detected = detectRecoveryLinkFormat({
          search,
          hash: window.location.hash,
        });
        if (!cancelled) setFormat(detected);

        const sessionResponse = await fetch(STAFF_RECOVER_SESSION_API_PATH, {
          credentials: "same-origin",
        });
        const sessionPayload = (await sessionResponse.json().catch(() => null)) as {
          sessionReady?: boolean;
        } | null;
        if (sessionPayload?.sessionReady) {
          if (!cancelled) setPhase("ready");
          return;
        }

        const inspectResponse = await fetch(STAFF_RECOVER_SESSION_API_PATH, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ inspect_only: true, format: detected }),
        });
        const inspectPayload = (await inspectResponse.json().catch(() => null)) as {
          canHydrate?: boolean;
          stage?: string;
          format?: RecoveryLinkFormat;
        } | null;
        if (!cancelled && inspectPayload?.format) setFormat(inspectPayload.format);

        if (inspectPayload?.canHydrate) {
          if (!cancelled) setPhase("confirm");
          return;
        }
        if (!cancelled) {
          setPhase("invalid");
          setError(recoveryUserError(inspectPayload?.stage));
        }
      } catch {
        if (!cancelled) {
          setPhase("invalid");
          setError(recoveryUserError(null));
        }
      }
    }

    void inspect();
    return () => {
      cancelled = true;
    };
  }, []);

  async function hydrateLink() {
    setPending(true);
    setError(null);
    try {
      const body = recoveryHydrateBodyFromLocation({
        search: new URLSearchParams(window.location.search),
        hash: window.location.hash,
      });
      const response = await fetch(STAFF_RECOVER_SESSION_API_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...body, inspect_only: false }),
      });
      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        stage?: string;
        format?: RecoveryLinkFormat;
      } | null;
      if (payload?.format) setFormat(payload.format);
      if (!response.ok || !payload?.ok) {
        setPhase("invalid");
        setError(payload?.error ?? recoveryUserError(payload?.stage));
        setPending(false);
        return;
      }
      window.history.replaceState(null, "", window.location.pathname);
      setPhase("ready");
      setPending(false);
    } catch {
      setPhase("invalid");
      setError(recoveryUserError(null));
      setPending(false);
    }
  }

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
        body: JSON.stringify({ password, confirm }),
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
      setError(payload?.error ?? "Could not update that password. Request a new reset link.");
      setPending(false);
    } catch {
      setError("Could not update that password. Request a new reset link.");
      setPending(false);
    }
  }

  if (phase === "inspecting") {
    return <p className="text-sm text-muted">Checking your reset link…</p>;
  }

  if (phase === "invalid") {
    return (
      <div className="space-y-4">
        <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
          {error ?? recoveryUserError(null)}
        </p>
        <Button href={STAFF_DASHBOARD_LOGIN_PATH}>Return to staff sign-in</Button>
      </div>
    );
  }

  if (phase === "confirm") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink">
          This looks like a staff password reset link. Continue on this page to
          set a new password. Waiting for this click keeps email scanners from
          using the link first.
        </p>
        {error ? (
          <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
        ) : null}
        <Button type="button" disabled={pending} onClick={() => void hydrateLink()}>
          {pending ? "Opening reset session…" : "Continue to set password"}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="sr-only" data-recovery-format={format}>
        Recovery format {format}
      </p>
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
