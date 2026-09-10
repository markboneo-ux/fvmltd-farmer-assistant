"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FarmerSubpage } from "@/components/FarmerSubpage";

type AccountPayload = {
  email: string | null;
  country: string | null;
  region: string | null;
  farmerLevel: string | null;
  accessLabel: string;
  remaining: {
    messages: number;
    cases: number;
    imageAnalyses: number;
    voiceMessages: number;
  };
  promoStatus: string;
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <p className="text-sm text-muted">{label}</p>
      <p className="max-w-[60%] text-right text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

export function AccountView() {
  const router = useRouter();
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/account");
      if (response.status === 401) {
        router.replace("/login?next=/account");
        return;
      }
      const payload = (await response.json()) as { account?: AccountPayload; error?: string };
      if (!response.ok || !payload.account) {
        setError(payload.error || "I couldn’t load your account.");
        return;
      }
      setAccount(payload.account);
    })();
  }, [router]);

  async function logOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  if (error) {
    return (
      <FarmerSubpage title="Account">
        <p className="text-sm text-ink">{error}</p>
      </FarmerSubpage>
    );
  }

  if (!account) {
    return (
      <FarmerSubpage title="Account">
        <p className="text-sm text-muted">Loading…</p>
      </FarmerSubpage>
    );
  }

  return (
    <FarmerSubpage title="Account" subtitle="Your FVM Crop Solution access.">
      <div className="rounded-2xl bg-surface px-4 ring-1 ring-line">
        <Row label="Email" value={account.email || "—"} />
        <Row label="Country" value={account.country || "—"} />
        <Row label="Region" value={account.region || "—"} />
        <Row label="Farmer level" value={account.farmerLevel || "—"} />
        <Row label="Access tier" value={account.accessLabel} />
        <Row label="Promo status" value={account.promoStatus} />
      </div>
      <h2 className="mt-6 text-sm font-semibold text-ink">Remaining usage</h2>
      <div className="mt-2 rounded-2xl bg-surface px-4 ring-1 ring-line">
        <Row label="Messages" value={String(account.remaining.messages)} />
        <Row label="Crop cases" value={String(account.remaining.cases)} />
        <Row label="Image analyses" value={String(account.remaining.imageAnalyses)} />
        <Row label="Voice messages" value={String(account.remaining.voiceMessages)} />
      </div>
      <div className="mt-6 space-y-2">
        <Link
          href="/cases"
          className="flex min-h-11 items-center rounded-xl px-1 text-sm font-medium text-canopy"
        >
          My Cases
        </Link>
        <Link
          href="/follow-ups"
          className="flex min-h-11 items-center rounded-xl px-1 text-sm font-medium text-canopy"
        >
          Follow-ups
        </Link>
        <button
          type="button"
          onClick={() => void logOut()}
          className="flex min-h-11 w-full items-center rounded-xl px-1 text-left text-sm font-medium text-ink"
        >
          Log out
        </button>
      </div>
      <p className="mt-6 text-sm">
        <Link href="/" className="text-canopy underline underline-offset-2">
          Back to chat
        </Link>
      </p>
    </FarmerSubpage>
  );
}
