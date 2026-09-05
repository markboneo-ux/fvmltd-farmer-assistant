import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff/auth";
import { listCropCases } from "@/lib/cases/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const staff = await requireStaffApi();
  if (!staff.ok) return staff.response;

  const cases = await listCropCases();
  return NextResponse.json({
    cases: cases
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 200)
      .map((item) => ({
        id: item.id,
        crop: item.crop,
        country: item.country,
        district: item.district,
        intent: item.conversationIntent,
        caseStatus: item.caseStatus,
        diagnosisConfirmed: item.diagnosisConfirmed,
        diagnosisIncorrect: item.diagnosisIncorrect,
        needsReview: item.needsReview,
        includeInTrendLearning: item.includeInTrendLearning,
        knowledgeState: item.knowledgeState,
        createdAt: item.createdAt,
        farmerProblemText: item.farmerProblemText.slice(0, 180),
      })),
  });
}
