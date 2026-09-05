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
  similarCaseNote?: string;
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
  similarCaseNote,
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
  const sources = [
    ...(payload.webSources ?? []).map((item) => ({ name: item.name, url: item.url })),
    ...(payload.webCitations ?? []).map((item) => ({ name: item.sourceName, url: item.url })),
  ].filter((item) => item.name.trim());
  const uniqueSources = sources.filter(
    (item, index) => sources.findIndex((other) => other.name === item.name && other.url === item.url) === index,
  );
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
              Likely issue
            </h3>
            <p className="mt-1 whitespace-pre-wrap">{assessment}</p>
          </section>
          {payload.rankedCauses && payload.rankedCauses.length > 0 ? (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-canopy uppercase">
                Possible causes, ranked
              </h3>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
                {payload.rankedCauses.slice(0, 5).map((cause) => (
                  <li key={cause.category}>
                    {cause.label}. More likely if {cause.increasesIf.toLowerCase()}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          {payload.checksToday.length > 0 ? (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-canopy uppercase">
                What to check now
              </h3>
              <BulletList items={payload.checksToday} />
            </section>
          ) : null}
          {payload.safeActionsNow.length > 0 ? (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-canopy uppercase">
                What I would do next
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
            <p className="mt-1.5 text-sm">{payload.weatherBrief}</p>
          ) : null}
          {payload.weatherRisks.slice(0, 2).map((risk) => (
            <div key={`${risk.diseaseOrPest}-${risk.generatedAt}`} className="mt-1.5">
              <p className="text-sm font-medium text-ink">
                Conditions may favour {risk.diseaseOrPest.toLowerCase()} over the{" "}
                {risk.riskWindow}.
              </p>
              {risk.weatherDrivers[0] ? (
                <p className="mt-1 text-sm text-muted">{risk.weatherDrivers[0]}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted">{risk.disclaimer}</p>
            </div>
          ))}
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

      {uniqueSources.length > 0 ? (
        <div className="text-sm">
          <p className="text-xs font-semibold tracking-wide text-canopy uppercase">
            Sources
          </p>
          <ul className="mt-1 space-y-1">
            {uniqueSources.slice(0, 6).map((item) => (
              <li key={`${item.name}-${item.url ?? ""}`}>
                {item.url ? (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-canopy underline underline-offset-2"
                  >
                    {item.name}
                  </a>
                ) : (
                  <span>{item.name}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {similarCaseNote ? (
        <p className="text-xs text-muted">
          Supporting note only — not the diagnosis: {similarCaseNote}
        </p>
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
