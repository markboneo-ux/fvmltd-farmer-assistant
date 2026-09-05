import { NextResponse } from "next/server";
import { applyStaffReview } from "@/lib/admin/review";
import { requireStaffApi } from "@/lib/staff/auth";
import {
  getCropCase,
  updateCaseFromConversation,
  updateCaseReview,
} from "@/lib/cases/store";
import { ingestCaseForTrends } from "@/lib/trends/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function applyReview(request: Request, id: string) {
  const staff = await requireStaffApi();
  if (!staff.ok) return staff.response;

  const current = await getCropCase(id);
  if (!current) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const includeInTrendLearning =
    body.includeInTrendLearning === true
      ? true
      : body.includeInTrendLearning === false
        ? false
        : body.excludeFromLearning === true
          ? false
          : body.excludeFromLearning === false
            ? true
            : undefined;

  const patch = applyStaffReview(current, {
    diagnosisConfirmed: body.diagnosisConfirmed === true ? true : undefined,
    diagnosisIncorrect: body.diagnosisIncorrect === true ? true : undefined,
    needsReview: body.needsReview === true ? true : undefined,
    includeInTrendLearning,
    resolved: body.resolved === true ? true : undefined,
    unresolved: body.unresolved === true ? true : undefined,
  });

  const updatedFromConversation = await updateCaseFromConversation(
    id,
    current.farmerProblemText,
    {
      agronomistReviewed: true,
      diagnosisConfirmed: patch.diagnosisConfirmed,
      diagnosisIncorrect: patch.diagnosisIncorrect,
      needsReview: patch.needsReview,
      includeInTrendLearning: patch.includeInTrendLearning,
      knowledgeState: patch.knowledgeState,
      caseStatus: patch.caseStatus,
    },
  );

  const updated = await updateCaseReview(id, {
    diagnosisConfirmed: patch.diagnosisConfirmed,
    diagnosisIncorrect: patch.diagnosisIncorrect,
    needsReview: patch.needsReview,
    resolved: body.resolved === true,
    usefulForTrend:
      typeof body.usefulForTrend === "boolean" ? body.usefulForTrend : undefined,
    excludeFromLearning:
      typeof body.excludeFromLearning === "boolean"
        ? body.excludeFromLearning
        : patch.includeInTrendLearning === false
          ? true
          : undefined,
    includeInTrendLearning: patch.includeInTrendLearning,
    reviewNotes: typeof body.reviewNotes === "string" ? body.reviewNotes : undefined,
    reviewedBy: staff.staff.id,
  });

  const next = updated ?? updatedFromConversation;
  if (next) {
    await ingestCaseForTrends(next);
  }

  return NextResponse.json({ case: next });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return applyReview(request, id);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return applyReview(request, id);
}
