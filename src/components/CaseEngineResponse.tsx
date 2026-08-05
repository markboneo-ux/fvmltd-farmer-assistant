"use client";

import type { ReactNode } from "react";
import type {
  AgronomicCasePayload,
  CaseMode,
  CaseStage,
  SeverityLevel,
} from "@/lib/agronomy/case-schema";
import { isGuidanceStage, isInterviewStage } from "@/lib/agronomy/case-schema";
import { QUICK_HELP_MAX_QUESTIONS } from "@/lib/agronomy/case-schema";

type CaseEngineResponseProps = {
  payload: AgronomicCasePayload;
  model?: string;
  responseSeconds?: number;
  diagnosticCode?: string;
  onQuickReply?: (reply: string) => void;
  quickRepliesDisabled?: boolean;
  /** Only render quick replies when this matches payload.questionId. */
  activeQuestionId?: string | null;
  questionsAsked?: number | null;
  /** Force full summary (e.g. Full Crop Check mode). */
  forceShowSummary?: boolean;
};

const STAGE_LABELS: Record<CaseStage, string> = {
  intake: "Quick start",
  questioning: "Quick check",
  assessment: "Preliminary guidance",
  action_plan: "Action plan",
  follow_up: "Follow-up",
  resolved: "Resolved",
  human_review: "Needs expert review",
};

const MODE_LABELS: Record<CaseMode, string> = {
  quick_help: "Quick Help",
  full_crop_check: "Full Crop Check",
};

const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  unknown: "Not yet clear",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-[0.7rem] font-semibold tracking-[0.14em] text-canopy uppercase">
        {title}
      </h3>
      <div className="text-sm leading-relaxed text-ink">{children}</div>
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;

  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function CollectedSummary({ payload }: { payload: AgronomicCasePayload }) {
  return (
    <div className="space-y-3">
      <Section title="What we know">
        <p className="whitespace-pre-wrap">{payload.preliminaryAssessment}</p>
      </Section>
      {payload.severity !== "unknown" ? (
        <p className="text-sm text-muted">
          Severity:{" "}
          <span className="font-medium text-ink">
            {SEVERITY_LABELS[payload.severity]}
          </span>
        </p>
      ) : null}
      {payload.regionalContext.country ? (
        <p className="text-sm text-muted">
          Region:{" "}
          <span className="font-medium text-ink">
            {payload.regionalContext.country}
            {payload.regionalContext.district
              ? ` / ${payload.regionalContext.district}`
              : ""}
          </span>
        </p>
      ) : null}
    </div>
  );
}

export function CaseEngineResponse({
  payload,
  model,
  responseSeconds,
  diagnosticCode,
  onQuickReply,
  quickRepliesDisabled = false,
  activeQuestionId = null,
  questionsAsked = null,
  forceShowSummary = false,
}: CaseEngineResponseProps) {
  const showGuidance = isGuidanceStage(payload.stage);
  const interviewing = isInterviewStage(payload.stage);
  const showFullSummary =
    forceShowSummary ||
    showGuidance ||
    payload.mode === "full_crop_check";

  const questionMatches =
    !payload.questionId ||
    !activeQuestionId ||
    payload.questionId === activeQuestionId;

  const showQuickReplies =
    Boolean(onQuickReply) &&
    payload.quickReplies.length > 0 &&
    questionMatches &&
    !quickRepliesDisabled;

  // Farmer UI never renders internalMissingInformation.

  return (
    <div className="space-y-4">
      {interviewing && !showFullSummary ? (
        <>
          {typeof questionsAsked === "number" ? (
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">
              Question {Math.min(questionsAsked, QUICK_HELP_MAX_QUESTIONS)} of
              up to {QUICK_HELP_MAX_QUESTIONS}
            </p>
          ) : null}

          {payload.nextQuestion ? (
            <Section title="Current question">
              <p className="font-medium whitespace-pre-wrap">
                {payload.nextQuestion}
              </p>
            </Section>
          ) : null}

          {showQuickReplies ? (
            <div className="flex flex-wrap gap-2">
              {payload.quickReplies.map((reply, index) => (
                <button
                  key={`${payload.questionId}-${reply}-${index}`}
                  type="button"
                  disabled={quickRepliesDisabled}
                  onClick={() => onQuickReply?.(reply)}
                  className="min-h-10 rounded-lg bg-sky/80 px-3 py-2 text-left text-sm font-medium text-canopy ring-1 ring-line transition hover:bg-sky disabled:opacity-50"
                >
                  {reply}
                </button>
              ))}
            </div>
          ) : null}

          <details className="rounded-xl bg-field/80 px-3 py-2 text-sm ring-1 ring-line">
            <summary className="cursor-pointer font-semibold text-canopy">
              View information collected
            </summary>
            <div className="mt-3">
              <CollectedSummary payload={payload} />
            </div>
          </details>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-sky px-2.5 py-1 text-xs font-semibold text-canopy ring-1 ring-line">
              {MODE_LABELS[payload.mode]}
            </span>
            <span className="inline-flex items-center rounded-md bg-field px-2.5 py-1 text-xs font-semibold text-ink ring-1 ring-line">
              {STAGE_LABELS[payload.stage]}
            </span>
            {showGuidance || payload.severity !== "unknown" ? (
              <span className="inline-flex items-center rounded-md bg-sun/20 px-2.5 py-1 text-xs font-semibold text-warn ring-1 ring-sun/40">
                Severity: {SEVERITY_LABELS[payload.severity]}
              </span>
            ) : null}
          </div>

          <Section title="Preliminary assessment">
            <p className="whitespace-pre-wrap">{payload.preliminaryAssessment}</p>
          </Section>

          {payload.nextQuestion ? (
            <Section title="Optional next step">
              <p className="font-medium whitespace-pre-wrap">
                {payload.nextQuestion}
              </p>
            </Section>
          ) : null}

          {showQuickReplies ? (
            <div className="flex flex-wrap gap-2">
              {payload.quickReplies.map((reply, index) => (
                <button
                  key={`${payload.questionId}-${reply}-${index}`}
                  type="button"
                  disabled={quickRepliesDisabled}
                  onClick={() => onQuickReply?.(reply)}
                  className="min-h-10 rounded-lg bg-sky/80 px-3 py-2 text-left text-sm font-medium text-canopy ring-1 ring-line transition hover:bg-sky disabled:opacity-50"
                >
                  {reply}
                </button>
              ))}
            </div>
          ) : null}

          {payload.checksToday.length > 0 ? (
            <Section title="What to inspect today">
              <BulletList items={payload.checksToday} />
            </Section>
          ) : null}

          {payload.safeActionsNow.length > 0 ? (
            <Section title="Safe actions now">
              <BulletList items={payload.safeActionsNow} />
            </Section>
          ) : null}

          {payload.actionsToAvoid.length > 0 ? (
            <Section title="Actions to avoid">
              <BulletList items={payload.actionsToAvoid} />
            </Section>
          ) : null}

          {payload.weatherRisks.length > 0 ? (
            <Section title="Weather-linked risk">
              <div className="space-y-3">
                {payload.weatherRisks.map((risk) => (
                  <div
                    key={`${risk.diseaseOrPest}-${risk.generatedAt}`}
                    className="space-y-1 rounded-xl bg-sky/40 px-3 py-2 ring-1 ring-line"
                  >
                    <p className="font-semibold text-ink">
                      {risk.riskLevel.toUpperCase()} — {risk.diseaseOrPest}
                    </p>
                    <p className="text-sm">
                      Potential concern: Conditions may favour this pressure
                      during the {risk.riskWindow}.
                    </p>
                    <p className="text-xs font-semibold text-canopy uppercase">
                      Weather drivers
                    </p>
                    <BulletList items={risk.weatherDrivers} />
                    <p className="text-xs font-semibold text-canopy uppercase">
                      Actions
                    </p>
                    <BulletList items={risk.preventiveActions} />
                    <p className="text-xs text-muted">{risk.disclaimer}</p>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {payload.verifiedInputOptions.length > 0 ? (
            <Section title="Verified regional input options">
              <div className="space-y-3">
                {payload.verifiedInputOptions.map((option) => (
                  <div
                    key={`${option.productType}-${option.activeIngredientOrNutrient}`}
                    className="space-y-1 rounded-xl bg-field px-3 py-2 ring-1 ring-line"
                  >
                    <p className="font-semibold text-ink">
                      {option.activeIngredientOrNutrient}
                    </p>
                    <p className="text-xs text-muted">
                      Type: {option.productType}
                    </p>
                    <p className="text-xs">
                      Legal registration: {option.registrationStatus}
                    </p>
                    <p className="text-xs">
                      Local availability: {option.availabilityStatus}
                    </p>
                    <p className="text-xs">
                      Source: {option.officialSource || "Not recorded"}
                    </p>
                    <p className="text-xs">
                      Last verified: {option.lastVerifiedAt || "Unknown"}
                    </p>
                    <BulletList items={option.labelRestrictions} />
                    {option.verifiedBrands.length > 0 ? (
                      <div className="pt-1">
                        <p className="text-xs font-semibold text-canopy">
                          Verified brands
                        </p>
                        {option.verifiedBrands.map((brand) => (
                          <div key={brand.brandName} className="mt-1 text-xs">
                            <p className="font-medium">{brand.brandName}</p>
                            <p>{brand.whyConsidered}</p>
                            <p>
                              Registration: {brand.registrationStatus} · Stock:{" "}
                              {brand.availabilityStatus}
                            </p>
                            <p>
                              Agronomist confirmation:{" "}
                              {brand.agronomistConfirmationRequired
                                ? "Required"
                                : "Approved in catalogue"}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted">
                        Brand names hidden until registration, crop use,
                        availability, and label source are all verified.
                      </p>
                    )}
                    <p className="text-xs text-muted">
                      Agronomist confirmation:{" "}
                      {option.agronomistConfirmationRequired
                        ? "Required before purchase or spray"
                        : "Catalogue-approved for this use"}
                    </p>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}

          {showGuidance ? (
            <div className="space-y-1 text-sm text-muted">
              <p>
                Photo needed:{" "}
                <span className="font-medium text-ink">
                  {payload.photoRecommended
                    ? "Yes — a clear photo helps"
                    : "Not required yet"}
                </span>
              </p>
              <p>
                Human escalation:{" "}
                <span className="font-medium text-ink">
                  {payload.escalationRecommended
                    ? "Recommended — ask FVMLTD staff if the crop is still declining"
                    : "Not required from this quick check alone"}
                </span>
              </p>
              {payload.regionalContext.productDataAsOf ||
              payload.regionalContext.weatherDataAsOf ? (
                <p className="text-xs">
                  Data as of: products{" "}
                  {payload.regionalContext.productDataAsOf || "—"} · weather{" "}
                  {payload.regionalContext.weatherDataAsOf || "—"}
                </p>
              ) : null}
            </div>
          ) : null}

          {!showGuidance ? (
            <details className="rounded-xl bg-field/80 px-3 py-2 text-sm ring-1 ring-line">
              <summary className="cursor-pointer font-semibold text-canopy">
                View information collected
              </summary>
              <div className="mt-3">
                <CollectedSummary payload={payload} />
              </div>
            </details>
          ) : null}
        </>
      )}

      {model ? (
        <p className="border-t border-line/60 pt-2 text-[0.7rem] text-muted">
          {model}
          {typeof responseSeconds === "number"
            ? ` · ${responseSeconds.toFixed(2)}s`
            : ""}
          {diagnosticCode ? ` · ${diagnosticCode}` : ""}
        </p>
      ) : null}
    </div>
  );
}
