import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff/auth";
import { listCropCases, listFollowups } from "@/lib/cases/store";
import { caseReviewPriority } from "@/lib/admin/cases-needing-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const staff = await requireStaffApi();
  if (!staff.ok) return staff.response;

  const cases = await listCropCases();
  const followups = await listFollowups();
  const latestOutcome = new Map(
    followups
      .filter((item) => item.outcome)
      .map((item) => [item.caseId, item.outcome]),
  );
  const mapped = cases.map((item) => {
    const review = caseReviewPriority(item, {
      outcome: latestOutcome.get(item.id) ?? null,
    });
    return {
      id: item.id,
      crop: item.crop,
      country: item.country,
      district: item.district || item.farmingArea,
      intent: item.conversationIntent,
      caseStatus: item.caseStatus,
      diagnosisConfirmed: item.diagnosisConfirmed,
      diagnosisIncorrect: item.diagnosisIncorrect,
      needsReview: review.needsReview,
      reviewScore: review.score,
      reviewReasons: review.reasons,
      includeInTrendLearning: item.includeInTrendLearning,
      knowledgeState: item.knowledgeState,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      farmerProblemText: item.farmerProblemText.slice(0, 180),
    };
  });
  const needsReviewQueue = mapped
    .filter((item) => item.needsReview)
    .sort((a, b) => b.reviewScore - a.reviewScore);

  return NextResponse.json({
    cases: mapped
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 200),
    needsReviewQueue: needsReviewQueue.slice(0, 50),
  });
}
