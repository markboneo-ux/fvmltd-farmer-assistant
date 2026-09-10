"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AccountShell } from "@/components/account/AccountShell";

type CaseRow = {
  id: string;
  title: string;
  dateLabel: string;
  preview: string;
};

export default function AccountCasesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/account/cases");
      const payload = (await response.json()) as { cases?: CaseRow[]; error?: string };
      if (!response.ok) {
        setError(payload.error || "Log in to see your crop cases.");
        return;
      }
      setRows(payload.cases ?? []);
    })();
  }, []);

  async function openCase(id: string) {
    await fetch(`/api/cases/active?caseId=${encodeURIComponent(id)}`);
    router.push("/");
  }

  return (
    <AccountShell title="My Crop Cases">
      {error ? <p className="text-sm text-muted">{error}</p> : null}
      {!error && rows.length === 0 ? (
        <p className="text-sm text-muted">No saved crop cases yet. Ask a question in chat to start one.</p>
      ) : null}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => void openCase(row.id)}
              className="w-full rounded-2xl bg-surface px-4 py-3 text-left ring-1 ring-line hover:bg-sky"
            >
              <p className="font-medium text-ink">{row.title}</p>
              <p className="mt-0.5 text-xs text-muted">{row.dateLabel}</p>
            </button>
          </li>
        ))}
      </ul>
    </AccountShell>
  );
}
