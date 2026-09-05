import { NextResponse } from "next/server";
import { applyStaffReview } from "@/lib/admin/review";
import { requireStaffApi } from "@/lib/staff/auth";
import { getCropCase, updateCaseFromConversation } from "@/lib/cases/store";
import { ingestCaseForTrends } from "@/lib/trends/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const staff = await requireStaffApi();
  if (!staff.ok) return staff.response;

  const { id } = await context.params;
  const current = await getCropCase(id);
  if (!current) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch = applyStaffReview(current, {
    diagnosisConfirmed: body.diagnosisConfirmed === true ? true : undefined,
    diagnosisIncorrect: body.diagnosisIncorrect === true ? true : undefined,
    needsReview: body.needsReview === true ? true : undefined,
    includeInTrendLearning:
      body.includeInTrendLearning === true
        ? true
        : body.includeInTrendLearning === false
          ? false
          : undefined,
    resolved: body.resolved === true ? true : undefined,
    unresolved: body.unresolved === true ? true : undefined,
  });

  const updated = await updateCaseFromConversation(id, current.farmerProblemText, {
    agronomistReviewed: true,
    diagnosisConfirmed: patch.diagnosisConfirmed,
    diagnosisIncorrect: patch.diagnosisIncorrect,
    needsReview: patch.needsReview,
    includeInTrendLearning: patch.includeInTrendLearning,
    knowledgeState: patch.knowledgeState,
    caseStatus: patch.caseStatus,
  });

  if (updated) {
    await ingestCaseForTrends(updated);
  }

  return NextResponse.json({ case: updated });
}
