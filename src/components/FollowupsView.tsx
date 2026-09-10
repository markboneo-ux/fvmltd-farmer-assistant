"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FarmerSubpage } from "@/components/FarmerSubpage";

type FollowupItem = {
  id: string;
  caseId: string;
  crop: string;
  dueDate: string;
  status: string;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function FollowupsView() {
  const router = useRouter();
  const [items, setItems] = useState<FollowupItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/followups?all=1");
      if (response.status === 401) {
        router.replace("/login?next=/follow-ups");
        return;
      }
      const payload = (await response.json()) as { followups?: FollowupItem[]; error?: string };
      if (!response.ok) {
        setError(payload.error || "I couldn’t load follow-ups.");
        return;
      }
      setItems(payload.followups ?? []);
    })();
  }, [router]);

  return (
    <FarmerSubpage title="Follow-ups" subtitle="How your crops are doing after the last check.">
      {error ? <p className="text-sm text-ink">{error}</p> : null}
      {items && items.length === 0 ? (
        <p className="text-sm text-muted">No follow-ups yet. They appear after a crop case is saved.</p>
      ) : null}
      <div className="space-y-3">
        {(items ?? []).map((item) => (
          <Link
            key={item.id}
            href={`/?case=${item.caseId}`}
            className="block rounded-2xl bg-surface p-4 ring-1 ring-line"
          >
            <p className="text-sm font-semibold text-ink">{item.crop}</p>
            <p className="mt-1 text-xs text-muted">Due {formatDate(item.dueDate)}</p>
            <p className="mt-2 text-sm capitalize text-canopy">{item.status.replace(/_/g, " ")}</p>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-sm">
        <Link href="/" className="text-canopy underline underline-offset-2">
          Back to chat
        </Link>
      </p>
    </FarmerSubpage>
  );
}
