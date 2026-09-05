"use client";

import type { AgronomicCasePayload } from "@/lib/agronomy/case-schema";
import {
  buildFarmerVisibleReply,
  shouldUseDiagnosisLayout,
  stripGuidancePrefix,
} from "@/lib/chat/visible-reply";
import type { WebSourceCitation } from "@/lib/research/types";

type ChatAssistantMessageProps = {
  payload?: AgronomicCasePayload;
  text: string;
  onQuickReply?: (reply: string) => void;
  onUploadPhoto?: () => void;
  quickRepliesDisabled?: boolean;
  showQuickReplies?: boolean;
};

function BulletList({ items, ordered = false }: { items: string[]; ordered?: boolean }) {
  if (items.length === 0) return null;
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`${ordered ? "list-decimal" : "list-disc"} mt-1 space-y-1 pl-5 text-sm leading-relaxed`}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </Tag>
  );
}

function SourcesUsed({
  sources,
  verificationLine,
}: {
  sources: WebSourceCitation[];
  verificationLine?: string | null;
}) {
  if (sources.length === 0) return null;
  return (
    <div className="text-xs text-muted">
      {verificationLine ? <p className="mb-1">{verificationLine}</p> : null}
      <details>
        <summary className="cursor-pointer text-muted hover:text-ink">
          Sources used ▾
        </summary>
        <ul className="mt-1.5 space-y-1.5">
          {sources.slice(0, 6).map((source) => (
            <li key={`${source.name}-${source.url ?? ""}`}>
              <p className="text-ink">
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-leaf underline-offset-2 hover:underline"
                  >
                    {source.name}
                  </a>
                ) : (
                  source.name
                )}
              </p>
              {source.organization && source.organization !== source.name ? (
                <p>{source.organization}</p>
              ) : null}
              {source.publishedAt ? (
                <p>Updated {source.publishedAt.slice(0, 10)}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function ChatAssistantMessage({
  payload,
  text,
  onQuickReply,
  onUploadPhoto,
  quickRepliesDisabled = false,
  showQuickReplies = false,
}: ChatAssistantMessageProps) {
  if (!payload) {
    return <p className="whitespace-pre-wrap">{text}</p>;
  }

  const assessment = stripGuidancePrefix(payload.preliminaryAssessment);
  const question = payload.nextQuestion.trim();
  const likelyCauses = payload.likelyCauses ?? [];
  const useDiagnosis =
    shouldUseDiagnosisLayout(payload) || likelyCauses.length > 0;
  const relevance = payload.weatherRelevance ?? (payload.weatherRisks.length > 0 ? "supporting" : "omit");
  const showWeatherCard = relevance === "central" && (payload.weatherRisks.length > 0 || Boolean(payload.weatherBrief));
  const supportingNote =
    relevance === "supporting"
      ? payload.weatherBrief ||
        (payload.weatherRisks.length > 0
          ? "The next few days are humid, however, so keep watching for spotting or lesions."
          : null)
      : null;
  const showProducts = payload.verifiedInputOptions.length > 0;
  const sources = (payload.webSources ?? []).filter((item) => item.name.trim());
  const urgent = payload.escalationRecommended || payload.severity === "high";

  const replies = payload.quickReplies.filter(
    (reply) => !/start full crop check/i.test(reply) && !/ask about products/i.test(reply),
  );
  const showReplies =
    showQuickReplies && Boolean(onQuickReply) && replies.length > 0;

  return (
    <div className="space-y-3">
      {urgent ? (
        <div
          className="rounded-xl bg-sun/15 px-3 py-2 text-sm font-medium text-warn ring-1 ring-sun/40"
          role="status"
        >
          This looks urgent. Treat the next steps as cautious triage, not a
          confirmed diagnosis.
        </div>
      ) : null}

      {useDiagnosis ? (
        <div className="space-y-3">
          <section>
            <h3 className="text-xs font-semibold tracking-wide text-canopy uppercase">
              What I think is most likely
            </h3>
            {likelyCauses.length > 0 ? (
              <BulletList items={likelyCauses} ordered />
            ) : null}
            <p className="mt-1 whitespace-pre-wrap">{payload.diagnosisWhy || assessment}</p>
          </section>
          {payload.checksToday.length > 0 ? (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-canopy uppercase">
                Check this now
              </h3>
              <BulletList items={payload.checksToday} ordered />
            </section>
          ) : null}
          {payload.safeActionsNow.length > 0 ? (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-canopy uppercase">
                What to do today
              </h3>
              <BulletList items={payload.safeActionsNow} />
            </section>
          ) : null}
          {payload.actionsToAvoid.length > 0 ? (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-canopy uppercase">
                What not to do
              </h3>
              <BulletList items={payload.actionsToAvoid} />
            </section>
          ) : null}
          {(payload.whatWouldChangeDiagnosis ?? []).length > 0 ? (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-canopy uppercase">
                What would change my diagnosis
              </h3>
              <BulletList items={payload.whatWouldChangeDiagnosis ?? []} />
            </section>
          ) : null}
          {payload.monitorNext ? (
            <p className="text-sm text-muted">{payload.monitorNext}</p>
          ) : null}
          {question ? (
            <p className="font-medium whitespace-pre-wrap">{question}</p>
          ) : null}
        </div>
      ) : (
        <p className="whitespace-pre-wrap">
          {buildFarmerVisibleReply(payload) || text}
        </p>
      )}

      {showWeatherCard ? (
        <div className="rounded-xl bg-sky px-3 py-2.5 ring-1 ring-line">
          <p className="text-xs font-semibold tracking-wide text-canopy uppercase">
            Weather
          </p>
          {payload.weatherBrief ? (
            <p className="mt-1.5 text-sm text-ink">{payload.weatherBrief}</p>
          ) : (
            payload.weatherRisks.slice(0, 2).map((risk) => (
              <div key={`${risk.diseaseOrPest}-${risk.generatedAt}`} className="mt-1.5">
                <p className="text-sm font-medium text-ink">
                  Conditions may favour {risk.diseaseOrPest.toLowerCase()} over the{" "}
                  {risk.riskWindow}.
                </p>
                {risk.weatherDrivers[0] ? (
                  <p className="mt-1 text-sm text-muted">{risk.weatherDrivers[0]}</p>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : supportingNote ? (
        <p className="text-sm text-muted">{supportingNote}</p>
      ) : null}

      {showProducts ? (
        <div className="text-sm">
          {payload.verifiedInputOptions.slice(0, 2).map((option) => (
            <p key={`${option.productType}-${option.activeIngredientOrNutrient}`} className="mt-1">
              One locally available option is{" "}
              {option.verifiedBrands[0]?.brandName
                ? `${option.verifiedBrands[0].brandName}, containing ${option.activeIngredientOrNutrient}`
                : option.activeIngredientOrNutrient}
              {option.registrationStatus ? ` (${option.registrationStatus})` : ""}.
            </p>
          ))}
        </div>
      ) : null}

      <SourcesUsed
        sources={sources}
        verificationLine={payload.sourceVerificationLine}
      />

      {showReplies ? (
        <div className="flex flex-wrap gap-2">
          {replies.map((reply, index) => (
            <button
              key={`${payload.questionId}-${reply}-${index}`}
              type="button"
              disabled={quickRepliesDisabled}
              onClick={() => {
                if (/upload a photo/i.test(reply) && onUploadPhoto) {
                  onUploadPhoto();
                  return;
                }
                onQuickReply?.(reply);
              }}
              className="min-h-10 rounded-full bg-sky px-3.5 py-2 text-left text-sm font-medium text-canopy ring-1 ring-line/80 transition hover:bg-white disabled:opacity-50"
            >
              {reply}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
