import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff/auth";
import { listCropCases } from "@/lib/cases/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const staff = await requireStaffApi();
  if (!staff.ok) return staff.response;
  const url = new URL(request.url);

  const cases = await listCropCases();
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const country = url.searchParams.get("country")?.trim().toLowerCase() ?? "";
  const crop = url.searchParams.get("crop")?.trim().toLowerCase() ?? "";
  const region = url.searchParams.get("region")?.trim().toLowerCase() ?? "";
  const outcome = url.searchParams.get("outcome")?.trim().toLowerCase() ?? "";
  const farmerType = url.searchParams.get("farmerType")?.trim().toLowerCase() ?? "";
  const filtered = cases.filter((item) => {
    if (country && (item.country ?? "").toLowerCase() !== country) return false;
    if (region && (item.district ?? "").toLowerCase() !== region) return false;
    if (crop && (item.crop ?? "").toLowerCase() !== crop) return false;
    if (farmerType && (item.userLevel ?? "").toLowerCase() !== farmerType) return false;
    if (outcome && (item.caseStatus ?? "").toLowerCase() !== outcome) return false;
    if (!q) return true;
    const hay = [
      item.crop,
      item.country,
      item.district,
      item.problemCategory,
      item.farmerProblemText,
      item.conversationIntent,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
  return NextResponse.json({
    cases: filtered
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
