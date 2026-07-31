"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { Button } from "@/components/Button";
import { StatusPill } from "@/components/StatusPill";
import type { AssessmentRecord, GuidanceMode } from "@/lib/assessment/types";
import { assessment as demoAssessment } from "@/data/placeholder";
import { useRegisteredFarmer } from "@/lib/farmers/useRegisteredFarmer";

const urgencyTone = {
  low: "low",
  moderate: "mild",
  high: "moderate",
  critical: "high",
} as const;

function modeTitle(mode: GuidanceMode): string {
  switch (mode) {
    case "approved_guidance":
      return "Approved preliminary guidance";
    case "needs_more_info":
      return "More information needed";
    case "human_review":
      return "Human technical review required";
  }
}

function modePill(mode: GuidanceMode): string {
  switch (mode) {
    case "approved_guidance":
      return "Approved";
    case "needs_more_info":
      return "Need info";
    case "human_review":
      return "Staff review";
  }
}

function modeTone(mode: GuidanceMode): "low" | "mild" | "moderate" | "high" {
  switch (mode) {
    case "approved_guidance":
      return "low";
    case "needs_more_info":
      return "mild";
    case "human_review":
      return "high";
  }
}

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

  const mode = assessment?.guidanceMode ?? "human_review";
  const showApprovedGuidance = mode === "approved_guidance";
  const showNeedsMoreInfo = mode === "needs_more_info";
  const showHumanReview = mode === "human_review";
  const showProductRecommendation =
    Boolean(assessment) &&
    !assessment!.humanReviewRequired &&
    assessment!.productRecommendationAllowed &&
    showApprovedGuidance;

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
            Confidence and safety rules decide whether guidance is shown, more
            information is requested, or the case goes to human review.
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
            <section
              className={`animate-rise-delay mb-4 rounded-2xl px-4 py-4 ring-1 ${
                showHumanReview
                  ? "bg-danger/10 ring-danger/30"
                  : showNeedsMoreInfo
                    ? "bg-sun/15 ring-sun/40"
                    : "bg-mint/20 ring-leaf-bright/40"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">
                    Decision
                  </p>
                  <h2 className="font-display mt-1 text-xl font-semibold text-ink">
                    {modeTitle(mode)}
                  </h2>
                </div>
                <StatusPill label={modePill(mode)} tone={modeTone(mode)} />
              </div>
              <p className="mt-2 text-sm text-muted">
                Confidence {assessment.confidenceScore}%
                {assessment.confidenceBand === "approved_guidance"
                  ? " (≥ 80%)"
                  : assessment.confidenceBand === "needs_more_info"
                    ? " (60–79%)"
                    : " (< 60%)"}
              </p>
              {showApprovedGuidance ? (
                <p className="mt-2 text-sm text-ink">
                  Approved preliminary guidance can be shown. This is still not a
                  final diagnosis.
                </p>
              ) : null}
              {showNeedsMoreInfo ? (
                <p className="mt-2 text-sm text-soil">
                  Please add missing information or additional photographs before
                  relying on this assessment.
                </p>
              ) : null}
              {showHumanReview ? (
                <p className="mt-2 text-sm text-danger">
                  This case has been sent for FVMLTD human technical review. A
                  final product recommendation is not shown.
                </p>
              ) : null}
            </section>

            <section className="mb-4 rounded-2xl bg-surface px-4 py-4 ring-1 ring-line">
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
                    className={`h-full rounded-full ${
                      assessment.confidenceScore >= 80
                        ? "bg-leaf-bright"
                        : assessment.confidenceScore >= 60
                          ? "bg-warn"
                          : "bg-danger"
                    }`}
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

            {showHumanReview && assessment.humanReviewReasons.length > 0 ? (
              <section className="mb-4 rounded-2xl bg-danger/10 px-4 py-4 ring-1 ring-danger/30">
                <h2 className="text-sm font-semibold text-danger">
                  Why human review was required
                </h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-danger">
                  {assessment.humanReviewReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {(showApprovedGuidance || showNeedsMoreInfo) &&
            assessment.immediateSafeActions.length > 0 ? (
              <section className="mb-4">
                <h2 className="font-display mb-2 text-lg font-semibold text-ink">
                  {showApprovedGuidance
                    ? "Approved preliminary guidance"
                    : "Interim safe actions"}
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
            ) : null}

            {showHumanReview ? (
              <section className="mb-4">
                <h2 className="font-display mb-2 text-lg font-semibold text-ink">
                  While you wait for staff
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
                <p className="mt-3 rounded-xl bg-danger/10 px-3 py-3 text-sm text-danger ring-1 ring-danger/30">
                  Final product recommendation is hidden until human technical
                  review is complete.
                </p>
              </section>
            ) : null}

            {(showNeedsMoreInfo ||
              assessment.missingInformation.length > 0) && (
              <section className="mb-4 rounded-2xl bg-sun/15 px-4 py-4 ring-1 ring-sun/40">
                <h2 className="text-sm font-semibold text-soil">
                  Missing information or photographs
                </h2>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-soil">
                  {assessment.missingInformation.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {showNeedsMoreInfo ? (
                  <div className="mt-3 grid gap-2">
                    <Button href={`/upload?caseId=${caseId}`}>
                      Add more photographs
                    </Button>
                    <Button href="/crop-check" variant="secondary">
                      Start another check with more detail
                    </Button>
                  </div>
                ) : null}
              </section>
            )}

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
                Final product recommendation:{" "}
                <strong>
                  {showProductRecommendation ? "Allowed" : "Not shown"}
                </strong>
                {!showProductRecommendation ? (
                  <span className="mt-1 block text-xs text-muted">
                    {assessment.humanReviewRequired
                      ? "Hidden because human review is required."
                      : "Preliminary AI assessments do not invent products or pesticide rates."}
                  </span>
                ) : null}
              </div>
            </section>

            <section className="mb-4 rounded-2xl bg-canopy px-4 py-4 text-white">
              <p className="text-xs font-semibold tracking-[0.12em] text-mint uppercase">
                Next step
              </p>
              <p className="mt-1 text-sm leading-relaxed text-white/90">
                {showHumanReview
                  ? "FVMLTD technical staff will review this case. Do not apply a final product recommendation yet."
                  : showNeedsMoreInfo
                    ? "Add the missing details or photographs, then re-run the assessment."
                    : "Follow the approved preliminary guidance and keep monitoring the crop."}
              </p>
              <div className="mt-4 grid gap-2">
                {showHumanReview ? (
                  <Button
                    href="/staff"
                    className="bg-sun text-soil hover:bg-[#f0c25d]"
                  >
                    Open staff review queue
                  </Button>
                ) : null}
                {showNeedsMoreInfo ? (
                  <Button
                    href={`/upload?caseId=${caseId}`}
                    className="bg-sun text-soil hover:bg-[#f0c25d]"
                  >
                    Upload additional photographs
                  </Button>
                ) : null}
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
