"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CaseRow = {
  id: string;
  crop: string | null;
  country: string | null;
  intent: string | null;
  caseStatus: string;
  farmerProblemText: string;
  needsReview: boolean;
};

export function AdminCaseListView() {
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/admin/cases");
      const payload = (await response.json()) as { cases?: CaseRow[]; error?: string };
      if (!response.ok) {
        setError(payload.error || "Could not load cases.");
        return;
      }
      setRows(payload.cases ?? []);
    })();
  }, []);

  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-4 py-8">
      <p className="text-sm">
        <Link className="text-canopy underline" href="/admin/insights">
          Back to insights
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-ink">Case review</h1>
      <p className="mt-1 text-sm text-muted">Staff only. Mark diagnosis and trend-learning flags.</p>
      {error ? <p className="mt-4 text-danger">{error}</p> : null}
      <ul className="mt-4 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <Link className="font-medium text-canopy" href={`/admin/cases/${row.id}`}>
              {row.crop || "Unknown crop"} · {row.country || "country unknown"}
            </Link>
            <p className="text-sm text-muted">
              {row.intent} · {row.caseStatus}
              {row.needsReview ? " · needs review" : ""}
            </p>
            <p className="mt-1 text-sm">{row.farmerProblemText}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
