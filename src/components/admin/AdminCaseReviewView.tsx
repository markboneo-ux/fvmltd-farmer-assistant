"use client";

import { useState } from "react";
import Link from "next/link";
import type { CaseMessageRecord, CropCaseRecord } from "@/lib/cases/types";

export function AdminCaseReviewView({
  cropCase,
  messages,
}: {
  cropCase: CropCaseRecord;
  messages: CaseMessageRecord[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function mark(body: Record<string, boolean>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/cases/${cropCase.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error || "Could not save review.");
        return;
      }
      setNotice("Review saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-4 py-8">
      <p className="text-sm">
        <Link className="text-canopy underline" href="/admin/cases">
          Back to cases
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold">Case review</h1>
      <p className="mt-1 text-sm text-muted">
        {cropCase.crop || "Unknown crop"} · {cropCase.country || "country unknown"} ·{" "}
        {cropCase.caseStatus}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-sm">{cropCase.farmerProblemText}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button disabled={busy} className="rounded-lg bg-sky px-3 py-2 text-sm" onClick={() => void mark({ diagnosisConfirmed: true })}>
          Diagnosis confirmed
        </button>
        <button disabled={busy} className="rounded-lg bg-sky px-3 py-2 text-sm" onClick={() => void mark({ diagnosisIncorrect: true, includeInTrendLearning: false })}>
          Diagnosis incorrect
        </button>
        <button disabled={busy} className="rounded-lg bg-sky px-3 py-2 text-sm" onClick={() => void mark({ needsReview: true })}>
          Needs review
        </button>
        <button disabled={busy} className="rounded-lg bg-sky px-3 py-2 text-sm" onClick={() => void mark({ resolved: true })}>
          Resolved
        </button>
        <button disabled={busy} className="rounded-lg bg-sky px-3 py-2 text-sm" onClick={() => void mark({ unresolved: true })}>
          Unresolved
        </button>
        <button disabled={busy} className="rounded-lg bg-sky px-3 py-2 text-sm" onClick={() => void mark({ includeInTrendLearning: true })}>
          Include in trend learning
        </button>
        <button disabled={busy} className="rounded-lg bg-sky px-3 py-2 text-sm" onClick={() => void mark({ includeInTrendLearning: false })}>
          Exclude from trend learning
        </button>
      </div>
      {error ? <p className="mt-3 text-danger">{error}</p> : null}
      {notice ? <p className="mt-3 text-sm">{notice}</p> : null}
      <section className="mt-6 space-y-2">
        <h2 className="font-semibold">Conversation</h2>
        {messages.map((item) => (
          <p key={item.id} className="rounded-xl bg-surface p-3 text-sm ring-1 ring-line">
            <span className="font-medium">{item.role}: </span>
            {item.content}
          </p>
        ))}
      </section>
    </main>
  );
}
