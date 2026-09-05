import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff/auth";
import {
  getCropCase,
  listCaseActions,
  listCaseAssessments,
  listCaseMessages,
  listCasePhotos,
  listObservations,
  listOutcomes,
  listFollowups,
} from "@/lib/cases/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const staff = await requireStaffApi();
  if (!staff.ok) return staff.response;

  const { id } = await context.params;
  const record = await getCropCase(id);
  if (!record) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  const [messages, photos, assessments, actions, observations, outcomes, followups] =
    await Promise.all([
      listCaseMessages(id),
      listCasePhotos(id),
      listCaseAssessments(id),
      listCaseActions(id),
      listObservations(id),
      listOutcomes(id),
      listFollowups(id),
    ]);

  const latestAssessment = assessments.at(-1)?.payload ?? null;

  return NextResponse.json({
    case: {
      id: record.id,
      crop: record.crop,
      country: record.country,
      region: record.district,
      variety: record.variety,
      farmerQuestion: record.farmerProblemText,
      userId: record.userId,
      guest: !record.userId,
      status: record.caseStatus,
      confidence: record.confidence,
      possibleCauses: record.possibleCauses,
      recommendedActions: record.recommendedActions,
      diagnosisConfirmed: record.diagnosisConfirmed,
      diagnosisIncorrect: record.diagnosisIncorrect,
      needsReview: record.needsReview,
      usefulForTrend: record.usefulForTrend,
      excludeFromLearning: record.excludeFromLearning,
      includeInTrendLearning: record.includeInTrendLearning,
      reviewNotes: record.reviewNotes,
      agronomistReviewed: record.agronomistReviewed,
      outcome: outcomes.at(-1)?.outcome ?? followups.at(-1)?.outcome ?? null,
      createdAt: record.createdAt,
    },
    conversation: messages.map((item) => ({
      role: item.role,
      content: item.content,
      hasImages: item.hasImages,
      createdAt: item.createdAt,
    })),
    photos: photos.map((item) => ({
      id: item.id,
      mimeType: item.mimeType,
      createdAt: item.createdAt,
    })),
    assessment: latestAssessment,
    observations,
    actions: actions.map((item) => item.actionText),
  });
}
