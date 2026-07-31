import { StatusPill } from "@/components/StatusPill";
import { StaffCaseActions } from "@/components/staff/StaffCaseActions";
import type { StaffCaseDetail } from "@/lib/staff/types";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-surface p-4 ring-1 ring-line">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-3 space-y-2 text-sm text-ink">{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("en", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function StaffCaseDetailView({ detail }: { detail: StaffCaseDetail }) {
  const { case: cropCase, farmer, farm, cropCycle, photos, soilTests, assessment, messages, labRequests } =
    detail;
  const closed =
    cropCase.status === "closed" || cropCase.status === "resolved";
  const location = [
    farm?.locationDescription,
    farm?.village ?? farmer.village,
    farm?.district ?? farm?.region ?? farmer.region,
    farm?.country ?? farmer.country,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4">
        <Section title="Case overview">
          <div className="mb-2 flex flex-wrap gap-2">
            <StatusPill label={cropCase.status.replaceAll("_", " ")} tone="mild" />
            {cropCase.isUrgent ? (
              <StatusPill label="Urgent" tone="high" />
            ) : null}
            {cropCase.awaitingFarmerReply ? (
              <StatusPill label="Awaiting farmer" tone="moderate" />
            ) : null}
          </div>
          <dl className="space-y-2">
            <Row label="Crop" value={cropCase.cropName} />
            <Row label="Variety" value={cropCycle?.variety ?? "Not recorded"} />
            <Row
              label="Growth stage"
              value={cropCycle?.growthStage?.replaceAll("_", " ") ?? null}
            />
            <Row
              label="Planting date"
              value={formatDate(cropCycle?.plantingDate)}
            />
            <Row label="Problem" value={cropCase.description} />
            <Row
              label="First observed"
              value={formatDate(cropCase.firstObservedOn)}
            />
            <Row
              label="Symptom location"
              value={cropCase.symptomLocation?.replaceAll("_", " ")}
            />
            <Row
              label="Spreading"
              value={
                cropCase.isSpreading == null
                  ? null
                  : cropCase.isSpreading
                    ? "Yes"
                    : "No"
              }
            />
            <Row
              label="% affected"
              value={
                cropCase.percentAffected == null
                  ? null
                  : `${cropCase.percentAffected}%`
              }
            />
          </dl>
        </Section>

        <Section title="Farmer details">
          <dl className="space-y-2">
            <Row label="Name" value={farmer.fullName} />
            <Row label="Farmer ID" value={farmer.farmerCode} />
            <Row label="WhatsApp" value={farmer.phone} />
            <Row
              label="Farm size"
              value={
                farmer.farmSize != null
                  ? `${farmer.farmSize} ${farmer.farmSizeUnit ?? ""}`.trim()
                  : null
              }
            />
            <Row
              label="Main crops"
              value={
                farmer.mainCrops.length ? farmer.mainCrops.join(", ") : null
              }
            />
          </dl>
        </Section>

        <Section title="Farm location">
          <dl className="space-y-2">
            <Row label="Farm" value={farm?.name ?? "—"} />
            <Row label="Location" value={location || "Not recorded"} />
            <Row
              label="Coordinates"
              value={
                farm?.latitude != null && farm?.longitude != null
                  ? `${farm.latitude}, ${farm.longitude}`
                  : null
              }
            />
            <Row
              label="Water source"
              value={farm?.waterSource?.replaceAll("_", " ")}
            />
            <Row
              label="Drainage"
              value={farm?.drainageCondition?.replaceAll("_", " ")}
            />
            <Row
              label="Growing system"
              value={farm?.growingSystem?.replaceAll("_", " ")}
            />
          </dl>
        </Section>

        <Section title="Photographs">
          {photos.length === 0 ? (
            <p className="text-muted">No photographs uploaded.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {photos.map((photo) => (
                <li
                  key={photo.id}
                  className="overflow-hidden rounded-xl bg-field ring-1 ring-line"
                >
                  {photo.previewUrl && !photo.isSkipped ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo.previewUrl}
                      alt={photo.label ?? photo.slotKey}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center px-2 text-center text-xs text-muted">
                      {photo.isSkipped ? "Skipped" : "No image"}
                    </div>
                  )}
                  <p className="px-2 py-1.5 text-[11px] font-medium text-muted">
                    {photo.label ?? photo.slotKey}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Soil results">
          {soilTests.length === 0 ? (
            <p className="text-muted">No soil test results on file for this farm.</p>
          ) : (
            <ul className="space-y-3">
              {soilTests.map((test) => (
                <li
                  key={test.id}
                  className="rounded-xl bg-field/70 px-3 py-2 ring-1 ring-line"
                >
                  <p className="font-medium">
                    Sampled {formatDate(test.sampledAt)}
                    {test.labName ? ` · ${test.labName}` : ""}
                  </p>
                  <p className="mt-1 text-muted">
                    pH {test.ph ?? "—"} · EC {test.electricalConductivity ?? "—"} ·
                    N {test.nitrogen ?? "—"} · P {test.phosphorus ?? "—"} · K{" "}
                    {test.potassium ?? "—"}
                  </p>
                  {test.notes ? (
                    <p className="mt-1 text-muted">{test.notes}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Fertilizer and spray history">
          <dl className="space-y-2">
            <Row
              label="Fertilizer"
              value={cropCase.recentFertilizer || "Not recorded"}
            />
            <Row
              label="Spray"
              value={cropCase.recentSpray || "Not recorded"}
            />
            <Row
              label="Irrigation"
              value={cropCase.irrigationFrequency?.replaceAll("_", " ")}
            />
            <Row
              label="Heavy rainfall"
              value={
                cropCase.recentHeavyRainfall == null
                  ? null
                  : cropCase.recentHeavyRainfall
                    ? "Yes"
                    : "No"
              }
            />
          </dl>
        </Section>
      </div>

      <div className="space-y-4">
        <Section title="AI assessment">
          {!assessment ? (
            <p className="text-muted">No AI assessment yet.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <StatusPill
                  label={`${Math.round(assessment.confidenceScore)}% confidence`}
                  tone={
                    assessment.confidenceScore >= 80
                      ? "low"
                      : assessment.confidenceScore >= 60
                        ? "mild"
                        : "high"
                  }
                />
                <StatusPill
                  label={assessment.effectiveUrgencyLevel}
                  tone={
                    assessment.effectiveUrgencyLevel === "critical" ||
                    assessment.effectiveUrgencyLevel === "high"
                      ? "high"
                      : "mild"
                  }
                />
                <StatusPill
                  label={assessment.staffStatus}
                  tone={
                    assessment.staffStatus === "approved" ||
                    assessment.staffStatus === "edited"
                      ? "low"
                      : "moderate"
                  }
                />
              </div>
              <p>{assessment.effectiveSummary}</p>
              <div>
                <p className="mb-1 font-semibold">Likely causes</p>
                <ul className="list-disc space-y-1 pl-5 text-muted">
                  {assessment.effectiveLikelyCauses.map((cause) => (
                    <li key={cause}>{cause}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 font-semibold">Immediate safe actions</p>
                <ul className="list-disc space-y-1 pl-5 text-muted">
                  {assessment.effectiveImmediateActions.length ? (
                    assessment.effectiveImmediateActions.map((action) => (
                      <li key={action}>{action}</li>
                    ))
                  ) : (
                    <li>None listed</li>
                  )}
                </ul>
              </div>
              {assessment.humanReviewReasons.length ? (
                <div>
                  <p className="mb-1 font-semibold">Human review reasons</p>
                  <ul className="list-disc space-y-1 pl-5 text-muted">
                    {assessment.humanReviewReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {assessment.productRecommendationAllowed ? null : (
                <p className="rounded-xl bg-warn/15 px-3 py-2 text-sm text-soil">
                  Final product recommendation is withheld while human review is
                  required.
                </p>
              )}
            </div>
          )}
        </Section>

        <Section title="Missing information">
          {assessment?.effectiveMissingInformation?.length ? (
            <ul className="list-disc space-y-1 pl-5 text-muted">
              {assessment.effectiveMissingInformation.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">No missing information flagged.</p>
          )}
        </Section>

        <Section title="Staff questions & requests">
          {messages.length === 0 && labRequests.length === 0 ? (
            <p className="text-muted">No staff questions or test requests yet.</p>
          ) : (
            <div className="space-y-3">
              {labRequests.map((req) => (
                <div
                  key={req.id}
                  className="rounded-xl bg-field/70 px-3 py-2 ring-1 ring-line"
                >
                  <p className="font-medium capitalize">
                    {req.requestType.replaceAll("_", " ")} test · {req.status}
                  </p>
                  {req.notes ? (
                    <p className="mt-1 text-muted">{req.notes}</p>
                  ) : null}
                </div>
              ))}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className="rounded-xl bg-field/70 px-3 py-2 ring-1 ring-line"
                >
                  <p className="text-xs font-semibold tracking-wide text-leaf uppercase">
                    {message.authorType}
                    {message.requiresReply ? " · reply needed" : ""}
                  </p>
                  <p className="mt-1">{message.body}</p>
                </div>
              ))}
            </div>
          )}
        </Section>

        <StaffCaseActions
          caseId={cropCase.id}
          assessment={assessment}
          isUrgent={cropCase.isUrgent}
          closed={closed}
        />
      </div>
    </div>
  );
}
