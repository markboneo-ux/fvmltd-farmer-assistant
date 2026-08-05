"use client";

import type { ReactNode } from "react";
import type {
  AgronomicCasePayload,
  CaseMode,
  CaseStage,
  SeverityLevel,
} from "@/lib/agronomy/case-schema";
import { isGuidanceStage } from "@/lib/agronomy/case-schema";

type CaseEngineResponseProps = {
  payload: AgronomicCasePayload;
  model?: string;
  responseSeconds?: number;
  diagnosticCode?: string;
  onQuickReply?: (reply: string) => void;
  quickRepliesDisabled?: boolean;
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

export function CaseEngineResponse({
  payload,
  model,
  responseSeconds,
  diagnosticCode,
  onQuickReply,
  quickRepliesDisabled = false,
}: CaseEngineResponseProps) {
  const showGuidance = isGuidanceStage(payload.stage);
  // Farmer UI never renders internalMissingInformation.

  return (
    <div className="space-y-4">
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

      <Section title={showGuidance ? "Preliminary assessment" : "What we know"}>
        <p className="whitespace-pre-wrap">{payload.preliminaryAssessment}</p>
      </Section>

      {payload.nextQuestion ? (
        <Section title={showGuidance ? "Optional next step" : "Next question"}>
          <p className="font-medium whitespace-pre-wrap">{payload.nextQuestion}</p>
        </Section>
      ) : null}

      {payload.quickReplies.length > 0 && onQuickReply ? (
        <div className="flex flex-wrap gap-2">
          {payload.quickReplies.map((reply) => (
            <button
              key={reply}
              type="button"
              disabled={quickRepliesDisabled}
              onClick={() => onQuickReply(reply)}
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

      {showGuidance ? (
        <div className="space-y-1 text-sm text-muted">
          <p>
            Photo needed:{" "}
            <span className="font-medium text-ink">
              {payload.photoRecommended ? "Yes — a clear photo helps" : "Not required yet"}
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
        </div>
      ) : null}

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
