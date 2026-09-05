"use client";

import type { AgronomicCasePayload } from "@/lib/agronomy/case-schema";
import {
  buildFarmerVisibleReply,
  shouldUseDiagnosisLayout,
  stripGuidancePrefix,
} from "@/lib/chat/visible-reply";

type ChatAssistantMessageProps = {
  payload?: AgronomicCasePayload;
  text: string;
  onQuickReply?: (reply: string) => void;
  onUploadPhoto?: () => void;
  quickRepliesDisabled?: boolean;
  showQuickReplies?: boolean;
};

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-1 space-y-1 pl-4 text-sm leading-relaxed">
      {items.map((item) => (
        <li key={item} className="list-disc">
          {item}
        </li>
      ))}
    </ul>
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
  const useDiagnosis = shouldUseDiagnosisLayout(payload);
  const relevance = payload.weatherRelevance ?? (payload.weatherRisks.length > 0 ? "supporting" : "omit");
  const showWeatherCard = relevance === "central" && (payload.weatherRisks.length > 0 || Boolean(payload.weatherBrief));
  const supportingNote =
    relevance === "supporting"
      ? payload.weatherBrief ||
        (payload.weatherRisks.length > 0
          ? "Also, the next few days are wet/humid, so leaf disease pressure may increase."
          : null)
      : null;
  const showProducts = payload.verifiedInputOptions.length > 0;
  const sources = (payload.webSources ?? []).filter((item) => item.name.trim());
  const urgent = payload.escalationRecommended || payload.severity === "high";

  const replies = payload.quickReplies.filter(
    (reply) => !/start full crop check/i.test(reply),
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
              What I think
            </h3>
            <p className="mt-1 whitespace-pre-wrap">{assessment}</p>
          </section>
          {payload.checksToday.length > 0 ? (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-canopy uppercase">
                What to check
              </h3>
              <BulletList items={payload.checksToday} />
            </section>
          ) : null}
          {payload.safeActionsNow.length > 0 ? (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-canopy uppercase">
                What to do next
              </h3>
              <BulletList items={payload.safeActionsNow} />
            </section>
          ) : null}
          {payload.actionsToAvoid.length > 0 ? (
            <p className="text-sm text-muted">
              Avoid: {payload.actionsToAvoid.join(" ")}
            </p>
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
        <div className="rounded-xl bg-field px-3 py-2.5 ring-1 ring-line">
          <p className="text-xs font-semibold tracking-wide text-canopy uppercase">
            Local options
          </p>
          <p className="mt-1 text-xs text-muted">
            Only verified catalogue entries. Availability is not invented.
          </p>
          <div className="mt-2 space-y-2">
            {payload.verifiedInputOptions.slice(0, 3).map((option) => (
              <div key={`${option.productType}-${option.activeIngredientOrNutrient}`}>
                <p className="text-sm font-medium text-ink">
                  {option.activeIngredientOrNutrient}
                </p>
                <p className="text-xs text-muted">
                  {option.productType}
                  {option.registrationStatus
                    ? ` · ${option.registrationStatus}`
                    : ""}
                  {option.availabilityStatus
                    ? ` · ${option.availabilityStatus}`
                    : ""}
                </p>
                {option.verifiedBrands[0] ? (
                  <p className="text-xs text-ink">
                    {option.verifiedBrands[0].brandName}
                  </p>
                ) : (
                  <p className="text-xs text-muted">
                    Brand names stay hidden until registration and availability
                    are verified.
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {sources.length > 0 ? (
        <div className="text-sm">
          <p className="font-medium text-ink">Sources</p>
          <ul className="mt-1 space-y-0.5">
            {sources.slice(0, 4).map((source) => (
              <li key={`${source.name}-${source.url ?? ""}`}>
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-leaf underline-offset-2 hover:underline"
                  >
                    • {source.name}
                  </a>
                ) : (
                  <span>• {source.name}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
