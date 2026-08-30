import { connection } from "next/server";
import { NextResponse } from "next/server";
import { persistCaseReview } from "@/lib/agronomy-memory/persist";
import { getCaseById } from "@/lib/agronomy-memory/store";
import {
  REVIEW_VERDICTS,
  type ReviewVerdict,
} from "@/lib/agronomy-memory/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Records an agronomist correction as separate evidence.
 * Does not overwrite the historical AI answer.
 */
export async function POST(request: Request) {
  await connection();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const caseId = typeof body.caseId === "string" ? body.caseId.trim() : "";
  const verdictRaw = typeof body.verdict === "string" ? body.verdict.trim() : "";

  if (!caseId || !getCaseById(caseId)) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  if (!(REVIEW_VERDICTS as readonly string[]).includes(verdictRaw)) {
    return NextResponse.json({ error: "Invalid review verdict." }, { status: 400 });
  }

  const row = await persistCaseReview({
    caseId,
    verdict: verdictRaw as ReviewVerdict,
    confirmedDiagnosis:
      typeof body.confirmedDiagnosis === "string"
        ? body.confirmedDiagnosis
        : null,
    recommendedCorrection:
      typeof body.recommendedCorrection === "string"
        ? body.recommendedCorrection
        : null,
    requiresLabConfirmation: body.requiresLabConfirmation === true,
    staffProfileId:
      typeof body.staffProfileId === "string" ? body.staffProfileId : null,
  });

  return NextResponse.json({ review: row });
}
