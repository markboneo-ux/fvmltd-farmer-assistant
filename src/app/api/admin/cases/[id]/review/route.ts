import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff/auth";
import { getCropCase, updateCaseReview } from "@/lib/cases/store";
import { ingestCaseForTrends } from "@/lib/trends/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const staff = await requireStaffApi();
  if (!staff.ok) return staff.response;

  const { id } = await context.params;
  const existing = await getCropCase(id);
  if (!existing) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const updated = await updateCaseReview(id, {
    diagnosisConfirmed:
      typeof body.diagnosisConfirmed === "boolean" ? body.diagnosisConfirmed : undefined,
    diagnosisIncorrect:
      typeof body.diagnosisIncorrect === "boolean" ? body.diagnosisIncorrect : undefined,
    needsReview: typeof body.needsReview === "boolean" ? body.needsReview : undefined,
    resolved: body.resolved === true,
    usefulForTrend: typeof body.usefulForTrend === "boolean" ? body.usefulForTrend : undefined,
    excludeFromLearning:
      typeof body.excludeFromLearning === "boolean" ? body.excludeFromLearning : undefined,
    reviewNotes: typeof body.reviewNotes === "string" ? body.reviewNotes : undefined,
    reviewedBy: staff.staff.id,
  });

  if (updated) {
    await ingestCaseForTrends(updated);
  }

  return NextResponse.json({ case: updated });
}
