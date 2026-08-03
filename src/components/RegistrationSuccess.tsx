"use client";

import { Button } from "@/components/Button";

type RegistrationSuccessProps = {
  farmerCode?: string | null;
  fullName?: string | null;
  pending?: boolean;
  onContinue: () => void;
  continueLabel?: string;
};

/**
 * Clear post-registration confirmation shown while the dashboard
 * hydrates or when soft navigation is still in progress.
 */
export function RegistrationSuccess({
  farmerCode,
  fullName,
  pending = false,
  onContinue,
  continueLabel = "Continue to dashboard",
}: RegistrationSuccessProps) {
  return (
    <div
      className="animate-rise space-y-4 rounded-2xl bg-surface px-4 py-6 ring-1 ring-line"
      role="status"
      aria-live="polite"
    >
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.14em] text-canopy uppercase">
          Farmers Value Mart Ltd
        </p>
        <h2 className="font-display text-2xl font-semibold text-ink">
          Registration successful
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          {fullName
            ? `Welcome, ${fullName}. Your farmer profile is ready.`
            : "Your farmer profile is ready."}
        </p>
      </div>

      <div className="rounded-xl bg-sky px-4 py-3 ring-1 ring-line">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">
          Farmer ID
        </p>
        <p className="mt-1 font-display text-xl font-semibold text-canopy">
          {farmerCode ?? (pending ? "Saving…" : "—")}
        </p>
      </div>

      <p className="text-sm text-muted">
        Keep this Farmer ID. You will use it when checking crops and talking with
        FVMLTD staff.
      </p>

      <Button type="button" onClick={onContinue} disabled={pending && !farmerCode}>
        {continueLabel}
      </Button>
    </div>
  );
}
