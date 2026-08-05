"use client";

import type { ReactNode } from "react";
import type { AgronomicCasePayload, CaseStage } from "@/lib/agronomy/case-schema";

type CaseEngineResponseProps = {
  payload: AgronomicCasePayload;
  model?: string;
  responseSeconds?: number;
  diagnosticCode?: string;
};

const STAGE_LABELS: Record<CaseStage, string> = {
  intake: "Intake",
  questioning: "Questioning",
  assessment: "Assessment",
  action_plan: "Action plan",
  follow_up: "Follow-up",
  resolved: "Resolved",
  human_review: "Human review",
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
  if (items.length === 0) {
    return <p className="text-muted">None noted yet.</p>;
  }

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
}: CaseEngineResponseProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-md bg-sky px-2.5 py-1 text-xs font-semibold text-canopy ring-1 ring-line">
          {STAGE_LABELS[payload.stage]}
        </span>
      </div>

      <Section title="Case summary">
        <p className="whitespace-pre-wrap">{payload.caseSummary}</p>
      </Section>

      {payload.nextQuestion ? (
        <Section title="Next question">
          <p className="font-medium whitespace-pre-wrap">{payload.nextQuestion}</p>
        </Section>
      ) : null}

      <Section title="Missing critical information">
        <BulletList items={payload.missingCriticalInformation} />
      </Section>

      {payload.redFlags.length > 0 ? (
        <Section title="Red flags">
          <BulletList items={payload.redFlags} />
        </Section>
      ) : null}

      {payload.likelyCauses.length > 0 ? (
        <Section title="Likely causes">
          <BulletList items={payload.likelyCauses} />
        </Section>
      ) : null}

      {payload.checksToday.length > 0 ? (
        <Section title="Checks today">
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

      {payload.escalationReason ? (
        <Section title="Escalation reason">
          <p className="whitespace-pre-wrap">{payload.escalationReason}</p>
        </Section>
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
