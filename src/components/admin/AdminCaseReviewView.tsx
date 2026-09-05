"use client";

import { useEffect, useState } from "react";

type CaseDetail = {
  case?: {
    id: string;
    crop: string | null;
    country: string | null;
    region: string | null;
    variety: string | null;
    farmerQuestion: string;
    userId: string | null;
    guest: boolean;
    status: string;
    confidence: string;
    possibleCauses: string[];
    recommendedActions: string[];
    diagnosisConfirmed: boolean;
    diagnosisIncorrect: boolean;
    needsReview: boolean;
    usefulForTrend: boolean;
    excludeFromLearning: boolean;
    includeInTrendLearning?: boolean;
    reviewNotes: string | null;
    agronomistReviewed: boolean;
    outcome: string | null;
    createdAt: string;
  };
  conversation?: Array<{
    role: string;
    content: string;
    hasImages: boolean;
    createdAt: string;
  }>;
  photos?: Array<{ id: string; mimeType: string; createdAt: string }>;
  assessment?: Record<string, unknown> | null;
  actions?: string[];
  error?: string;
};

export function AdminCaseReviewView({ caseId }: { caseId: string }) {
  const [data, setData] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");

  async function load() {
    const response = await fetch(`/api/admin/cases/${caseId}`);
    const payload = (await response.json()) as CaseDetail;
    if (!response.ok) {
      setError(payload.error || "Could not load case.");
      return;
    }
    setError(null);
    setData(payload);
    setNotes(payload.case?.reviewNotes ?? "");
  }

  useEffect(() => {
    let cancelled = false;
    async function loadCase() {
      const response = await fetch(`/api/admin/cases/${caseId}`);
      const payload = (await response.json()) as CaseDetail;
      if (cancelled) return;
      if (!response.ok) {
        setError(payload.error || "Could not load case.");
        return;
      }
      setError(null);
      setData(payload);
      setNotes(payload.case?.reviewNotes ?? "");
    }
    void loadCase();
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  async function mark(body: Record<string, unknown>) {
    setSaving(true);
    const response = await fetch(`/api/admin/cases/${caseId}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, reviewNotes: notes }),
    });
    setSaving(false);
    if (!response.ok) {
      setError("Could not save review.");
      return;
    }
    await load();
  }

  const record = data?.case;
  const assessment = data?.assessment as
    | {
        preliminaryAssessment?: string;
        checksToday?: string[];
        safeActionsNow?: string[];
      }
    | null
    | undefined;

  return (
    <div className="space-y-4">
      {error ? <p className="text-danger">{error}</p> : null}
      {record ? (
        <>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">Case</h2>
            <ul className="mt-2 space-y-1 text-sm">
              <li>Crop: {record.crop || "unknown"}</li>
              <li>Variety: {record.variety || "unknown"}</li>
              <li>
                Country / region: {record.country || "unknown"}
                {record.region ? ` / ${record.region}` : ""}
              </li>
              <li>Status: {record.status}</li>
              <li>Confidence: {record.confidence}</li>
              <li>Account: {record.guest ? "guest session" : `linked user ${record.userId}`}</li>
              <li>Outcome: {record.outcome || "none yet"}</li>
            </ul>
            <p className="mt-3 text-sm">
              <span className="font-medium">Farmer question: </span>
              {record.farmerQuestion}
            </p>
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">Conversation</h2>
            <ul className="mt-2 space-y-3 text-sm">
              {(data?.conversation ?? []).map((item, index) => (
                <li key={`${item.createdAt}-${index}`}>
                  <p className="text-xs font-semibold uppercase text-muted">{item.role}</p>
                  <p className="whitespace-pre-wrap">{item.content}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">AI diagnosis</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm">
              {assessment?.preliminaryAssessment || "No stored assessment."}
            </p>
            {record.possibleCauses.length > 0 ? (
              <p className="mt-2 text-sm">Causes noted: {record.possibleCauses.join("; ")}</p>
            ) : null}
            <p className="mt-2 text-sm">
              Actions recommended:{" "}
              {(data?.actions ?? record.recommendedActions).join("; ") || "none"}
            </p>
            <p className="mt-2 text-sm">Photos: {data?.photos?.length ?? 0}</p>
          </section>
          <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
            <h2 className="font-semibold">Staff review</h2>
            <textarea
              className="mt-2 min-h-24 w-full rounded-lg border border-line px-3 py-2 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Internal review notes"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                className="rounded-full bg-canopy px-3 py-2 text-sm text-white"
                onClick={() => void mark({ diagnosisConfirmed: true, resolved: true })}
              >
                Diagnosis confirmed
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-full bg-danger px-3 py-2 text-sm text-white"
                onClick={() =>
                  void mark({ diagnosisIncorrect: true, excludeFromLearning: true })
                }
              >
                Diagnosis incorrect
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-full bg-sky px-3 py-2 text-sm text-canopy ring-1 ring-line"
                onClick={() => void mark({ needsReview: true })}
              >
                Needs review
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-full bg-sky px-3 py-2 text-sm text-canopy ring-1 ring-line"
                onClick={() => void mark({ resolved: true })}
              >
                Resolved
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-full bg-sky px-3 py-2 text-sm text-canopy ring-1 ring-line"
                onClick={() => void mark({ usefulForTrend: true })}
              >
                Useful for trend learning
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-full bg-sky px-3 py-2 text-sm text-canopy ring-1 ring-line"
                onClick={() => void mark({ includeInTrendLearning: true, excludeFromLearning: false })}
              >
                Include in trend learning
              </button>
              <button
                type="button"
                disabled={saving}
                className="rounded-full bg-sky px-3 py-2 text-sm text-canopy ring-1 ring-line"
                onClick={() => void mark({ excludeFromLearning: true, includeInTrendLearning: false })}
              >
                Exclude from learning
              </button>
            </div>
            <p className="mt-3 text-xs text-muted">
              Confirmed: {record.diagnosisConfirmed ? "yes" : "no"} · Incorrect:{" "}
              {record.diagnosisIncorrect ? "yes" : "no"} · Useful:{" "}
              {record.usefulForTrend ? "yes" : "no"} · Excluded:{" "}
              {record.excludeFromLearning || record.includeInTrendLearning === false ? "yes" : "no"}
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
