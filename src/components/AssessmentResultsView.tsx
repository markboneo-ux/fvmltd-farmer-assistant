"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/Button";
import { StatusPill } from "@/components/StatusPill";
import type { AssessmentRecord } from "@/lib/assessment/types";
import { assessment as demoAssessment } from "@/data/placeholder";
import { useRegisteredFarmer } from "@/lib/farmers/useRegisteredFarmer";

const urgencyTone = {
  low: "low",
  moderate: "mild",
  high: "moderate",
  critical: "high",
} as const;

export function AssessmentResultsView() {
  const farmer = useRegisteredFarmer();
  const searchParams = useSearchParams();
  const caseId = searchParams.get("caseId")?.trim() ?? "";

  const [result, setResult] = useState<{
    caseId: string;
    farmerId: string;
    assessment: AssessmentRecord | null;
    error: string | null;
  } | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!caseId || !farmer?.id) return;

    const farmerId = farmer.id;
    let cancelled = false;

    fetch(`/api/crop-cases/${caseId}/assess?farmerId=${farmerId}`)
      .then(async (response) => {
        const payload = (await response.json()) as {
          assessment?: AssessmentRecord | null;
          error?: string;
        };
        if (cancelled) return;
        if (!response.ok) {
          setResult({
            caseId,
            farmerId,
            assessment: null,
            error: payload.error ?? "Could not load assessment.",
          });
          return;
        }
        setResult({
          caseId,
          farmerId,
          assessment: payload.assessment ?? null,
          error: null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setResult({
            caseId,
            farmerId,
            assessment: null,
            error: "Could not load assessment.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [caseId, farmer?.id]);

  const matched =
    Boolean(caseId && farmer?.id) &&
    result?.caseId === caseId &&
    result.farmerId === farmer?.id;
  const loading = Boolean(caseId && farmer?.id) && !matched;
  const assessment = matched ? result!.assessment : null;
  const error = matched ? result!.error : null;

  async function runAssessment(force = false) {
    if (!caseId || !farmer?.id) return;
    const farmerId = farmer.id;
    setRunning(true);
    try {
      const response = await fetch(`/api/crop-cases/${caseId}/assess`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farmerId, force }),
      });
      const payload = (await response.json()) as {
        assessment?: AssessmentRecord;
        error?: string;
      };
      if (!response.ok || !payload.assessment) {
        throw new Error(payload.error ?? "Assessment failed.");
      }
      setResult({
        caseId,
        farmerId,
        assessment: payload.assessment,
        error: null,
      });
    } catch (err) {
      setResult({
        caseId,
        farmerId,
        assessment: null,
        error: err instanceof Error ? err.message : "Assessment failed.",
      });
    } finally {
      setRunning(false);
    }
  }

  if (!caseId) {
    return (
      <AppShell bare>
        <div className="flex min-h-dvh flex-col px-4 pt-4">
          <header className="mb-5">
            <Link href="/dashboard" className="text-sm font-medium text-leaf">
              ← Back
            </Link>
            <h1 className="font-display mt-3 text-2xl font-semibold text-ink">
              Assessment results
            </h1>
            <p className="mt-1.5 text-sm text-muted">
              Demo placeholder — complete a crop check to see a live preliminary
              assessment.
            </p>
          </header>

          <section className="mb-4 rounded-2xl bg-surface px-4 py-4 ring-1 ring-line">
            <h2 className="font-display text-xl font-semibold text-ink">
              {demoAssessment.likelyIssue}
            </h2>
            <p className="mt-3 text-sm text-muted">{demoAssessment.summary}</p>
          </section>

          <Button href="/crop-check">Start a crop check</Button>

          <div className="-mx-4 mt-auto">
            <BottomNav active="/results" />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell bare>
      <div className="flex min-h-dvh flex-col px-4 pt-4">
        <header className="animate-rise mb-5">
          <Link
            href="/dashboard"
            className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-leaf"
          >
            <span aria-hidden>←</span>
            Back
          </Link>
          <p className="text-xs font-semibold tracking-[0.12em] text-leaf uppercase">
            Preliminary assessment
          </p>
          <h1 className="font-display mt-1 text-2xl font-semibold text-ink">
            Assessment results
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            AI guidance only — not a final diagnosis. No unrestricted pesticide
            rates or invented products.
          </p>
        </header>

        {loading ? (
          <p className="text-sm text-muted">Loading assessment…</p>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger ring-1 ring-danger/30">
            {error}
          </div>
        ) : null}

        {!loading && !assessment ? (
          <div className="mb-4 space-y-3 rounded-2xl bg-surface px-4 py-4 ring-1 ring-line">
            <p className="text-sm text-ink">
              No assessment is saved for this case yet.
            </p>
            <Button
              type="button"
              disabled={running || !farmer}
              onClick={() => void runAssessment(false)}
            >
              {running ? "Running assessment…" : "Run preliminary assessment"}
            </Button>
          </div>
        ) : null}

        {assessment ? (
          <>
            <section className="animate-rise-delay mb-4 rounded-2xl bg-surface px-4 py-4 ring-1 ring-line">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted">Likely causes</p>
                  <h2 className="font-display mt-1 text-xl font-semibold text-ink">
                    {assessment.likelyCauses[0]}
                  </h2>
                </div>
                <StatusPill
                  label={assessment.urgencyLevel}
                  tone={urgencyTone[assessment.urgencyLevel]}
                />
              </div>

              {assessment.likelyCauses.length > 1 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
                  {assessment.likelyCauses.slice(1).map((cause) => (
                    <li key={cause}>{cause}</li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-muted">Confidence</span>
                  <span className="font-semibold text-canopy">
                    {assessment.confidenceScore}%
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-sky">
                  <div
                    className="h-full rounded-full bg-leaf-bright"
                    style={{
                      width: `${Math.max(0, Math.min(100, assessment.confidenceScore))}%`,
                    }}
                  />
                </div>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-muted">
                {assessment.caseSummary}
              </p>
            </section>

            <section className="mb-4">
              <h2 className="font-display mb-2 text-lg font-semibold text-ink">
                Immediate safe actions
              </h2>
              <ol className="space-y-2">
                {assessment.immediateSafeActions.map((item, index) => (
                  <li
                    key={`${index}-${item.slice(0, 24)}`}
                    className="flex gap-3 rounded-xl bg-surface/80 px-3 py-3 text-sm leading-relaxed text-ink ring-1 ring-line"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-canopy text-xs font-bold text-white">
                      {index + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ol>
            </section>

            {assessment.missingInformation.length > 0 ? (
              <section className="mb-4 rounded-2xl bg-sun/15 px-4 py-4 ring-1 ring-sun/40">
                <h2 className="text-sm font-semibold text-soil">
                  Missing information
                </h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-soil">
                  {assessment.missingInformation.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="mb-4 grid grid-cols-1 gap-2 text-sm">
              <div className="rounded-xl bg-surface px-3 py-3 ring-1 ring-line">
                Human review required:{" "}
                <strong>
                  {assessment.humanReviewRequired ? "Yes" : "No"}
                </strong>
              </div>
              <div className="rounded-xl bg-surface px-3 py-3 ring-1 ring-line">
                Laboratory test needed:{" "}
                <strong>
                  {assessment.laboratoryTestNeeded ? "Yes" : "No"}
                </strong>
              </div>
              <div className="rounded-xl bg-surface px-3 py-3 ring-1 ring-line">
                Product recommendation allowed:{" "}
                <strong>No</strong>
                <span className="mt-1 block text-xs text-muted">
                  Preliminary AI assessments cannot invent products or pesticide
                  rates. Staff review is required for catalog products.
                </span>
              </div>
            </section>

            <section className="mb-4 rounded-2xl bg-canopy px-4 py-4 text-white">
              <p className="text-xs font-semibold tracking-[0.12em] text-mint uppercase">
                Next step
              </p>
              <p className="mt-1 text-sm leading-relaxed text-white/90">
                {assessment.humanReviewRequired
                  ? "FVMLTD staff review is recommended before any pesticide or product use."
                  : "Continue monitoring and follow the immediate safe actions listed."}
              </p>
              <div className="mt-4 grid gap-2">
                <Button href="/staff" className="bg-sun text-soil hover:bg-[#f0c25d]">
                  View staff review queue
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={running}
                  onClick={() => void runAssessment(true)}
                  className="border-0 bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25"
                >
                  {running ? "Re-running…" : "Re-run assessment"}
                </Button>
              </div>
            </section>
          </>
        ) : null}

        <div className="-mx-4 mt-auto">
          <BottomNav active="/results" />
        </div>
      </div>
    </AppShell>
  );
}
