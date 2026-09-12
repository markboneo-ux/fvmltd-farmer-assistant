"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AccountShell } from "@/components/account/AccountShell";
import { FVM_BETA_ACTIVATED_MESSAGE } from "@/lib/beta/usage-notice";

type AccessPayload = {
  identity?: { access?: string; email?: string | null; kind?: string };
  usage?: { messages?: number; cases?: number; imageAnalyses?: number };
  remaining?: { messages?: number; cases?: number; imageAnalyses?: number };
  caps?: { messages?: number; cases?: number; imageAnalyses?: number } | null;
  accessLabel?: string;
  limitReached?: boolean;
};

export default function AccountAccessPage() {
  const [data, setData] = useState<AccessPayload | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/session");
    if (!response.ok) return;
    setData((await response.json()) as AccessPayload);
  }

  useEffect(() => {
    void load();
  }, []);

  async function redeem(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/promo/redeem", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string; message?: string };
    setMessage(payload.message || payload.error || null);
    if (payload.ok) {
      setMessage(payload.message || FVM_BETA_ACTIVATED_MESSAGE);
      await load();
    }
  }

  const usage = data?.usage;
  const caps = data?.caps;
  const remaining = data?.remaining;
  const guest = data?.identity?.kind !== "registered";

  return (
    <AccountShell title="Access">
      <p className="text-sm text-muted">
        Current access: <span className="font-medium text-ink">{data?.accessLabel || "Guest"}</span>
      </p>
      {caps && usage ? (
        <ul className="mt-4 space-y-2 text-sm">
          <li>Messages used: {usage.messages ?? 0} of {caps.messages}</li>
          <li>Crop cases used: {usage.cases ?? 0} of {caps.cases}</li>
          <li>Photo checks used: {usage.imageAnalyses ?? 0} of {caps.imageAnalyses}</li>
          {remaining ? (
            <li className="text-muted">
              Remaining: {remaining.messages} messages, {remaining.cases} cases, {remaining.imageAnalyses} photos
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">Your current access does not use a free-usage cap.</p>
      )}

      <form className="mt-6 space-y-3" onSubmit={redeem}>
        <label className="block text-sm font-medium text-ink">
          Access code
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="off"
            className="mt-1 min-h-12 w-full rounded-xl bg-surface px-3 ring-1 ring-line"
          />
        </label>
        <button
          type="submit"
          className="min-h-12 w-full rounded-full bg-canopy text-sm font-semibold text-white"
        >
          Enter Access Code
        </button>
      </form>
      {message ? <p className="mt-3 text-sm text-ink">{message}</p> : null}
      {guest ? (
        <p className="mt-6 text-sm">
          <Link href="/signin" className="text-canopy underline underline-offset-2">
            Create Account
          </Link>
          {" · "}
          <Link href="/signin?mode=login" className="text-canopy underline underline-offset-2">
            Log In
          </Link>
        </p>
      ) : null}
      <p className="mt-6 text-xs text-muted">Paid upgrade options will appear here later.</p>
    </AccountShell>
  );
}
