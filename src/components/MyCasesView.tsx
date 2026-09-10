"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FarmerSubpage } from "@/components/FarmerSubpage";

type CaseItem = {
  id: string;
  crop: string;
  date: string;
  issueSummary: string;
  status: string;
  followUpDue: string | null;
  solved: boolean;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function MyCasesView() {
  const router = useRouter();
  const [cases, setCases] = useState<CaseItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/cases");
      if (response.status === 401) {
        router.replace("/login?next=/cases");
        return;
      }
      const payload = (await response.json()) as { cases?: CaseItem[]; error?: string };
      if (!response.ok) {
        setError(payload.error || "I couldn’t load your cases.");
        return;
      }
      setCases(payload.cases ?? []);
    })();
  }, [router]);

  return (
    <FarmerSubpage title="My Cases" subtitle="Your saved crop conversations.">
      {error ? <p className="text-sm text-ink">{error}</p> : null}
      {cases && cases.length === 0 ? (
        <p className="text-sm text-muted">No crop cases yet. Start from the chat when you need help.</p>
      ) : null}
      <div className="space-y-3">
        {(cases ?? []).map((item) => (
          <Link
            key={item.id}
            href={`/?case=${item.id}`}
            className="block rounded-2xl bg-surface p-4 ring-1 ring-line"
          >
            <p className="text-sm font-semibold text-ink">{item.crop}</p>
            <p className="mt-1 text-xs text-muted">{formatDate(item.date)}</p>
            <p className="mt-2 text-sm text-ink">{item.issueSummary}</p>
            <p className="mt-2 text-xs text-muted">
              Status: {item.solved ? "solved" : item.status || "unresolved"}
            </p>
            <p className="text-xs text-muted">
              Follow-up due: {item.followUpDue ? formatDate(item.followUpDue) : "—"}
            </p>
            <p className="text-xs font-medium text-canopy">
              {item.solved ? "Solved" : "Unresolved"}
            </p>
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
