"use client";

import { useEffect, useState } from "react";
import { AccountShell } from "@/components/account/AccountShell";

type FollowupRow = {
  id: string;
  title: string;
  followUpDate: string;
  status: string;
};

export default function AccountFollowupsPage() {
  const [rows, setRows] = useState<FollowupRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/account/followups");
      const payload = (await response.json()) as { followups?: FollowupRow[]; error?: string };
      if (!response.ok) {
        setError(payload.error || "Log in to see follow-ups.");
        return;
      }
      setRows(payload.followups ?? []);
    })();
  }, []);

  return (
    <AccountShell title="Follow-ups">
      {error ? <p className="text-sm text-muted">{error}</p> : null}
      {!error && rows.length === 0 ? (
        <p className="text-sm text-muted">No follow-ups yet. We’ll ask how the crop is doing when it would help.</p>
      ) : null}
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-2xl bg-surface px-4 py-3 ring-1 ring-line">
            <p className="font-medium text-ink">{row.title}</p>
            <p className="mt-0.5 text-xs text-muted">
              {row.followUpDate.slice(0, 10)} · {row.status}
            </p>
          </li>
        ))}
      </ul>
    </AccountShell>
  );
}
