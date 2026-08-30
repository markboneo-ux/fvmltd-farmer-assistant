import { connection } from "next/server";
import { NextResponse } from "next/server";
import { persistCaseOutcome } from "@/lib/agronomy-memory/persist";
import {
  FOLLOW_UP_OPTIONS,
  followUpQuestion,
  getCaseById,
  getDueFollowUp,
} from "@/lib/agronomy-memory/store";
import { CROP_OUTCOMES, type CropOutcome } from "@/lib/agronomy-memory/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isCropOutcome(value: string): value is CropOutcome {
  return (CROP_OUTCOMES as readonly string[]).includes(value);
}

export async function GET(request: Request) {
  await connection();
  const sessionId = new URL(request.url).searchParams.get("sessionId") || "";
  const due = sessionId ? getDueFollowUp(sessionId) : null;
  if (!due) {
    return NextResponse.json({ followUp: null });
  }
  return NextResponse.json({
    followUp: {
      caseId: due.id,
      question: followUpQuestion(),
      options: FOLLOW_UP_OPTIONS,
    },
  });
}

export async function POST(request: Request) {
  await connection();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const caseId = typeof body.caseId === "string" ? body.caseId.trim() : "";
  const outcomeRaw = typeof body.cropOutcome === "string" ? body.cropOutcome.trim() : "";
  const actionsTaken =
    typeof body.actionsTaken === "string" ? body.actionsTaken.trim() : "";

  if (!caseId || !getCaseById(caseId)) {
    return NextResponse.json({ error: "I could not find that crop case." }, { status: 404 });
  }

  if (!isCropOutcome(outcomeRaw)) {
    return NextResponse.json(
      {
        error: "Please choose Improved, About the same, Worse, or Problem solved.",
        options: FOLLOW_UP_OPTIONS,
      },
      { status: 400 },
    );
  }

  const days =
    typeof body.daysAfterRecommendation === "number"
      ? body.daysAfterRecommendation
      : 7;

  const row = await persistCaseOutcome({
    caseId,
    cropOutcome: outcomeRaw,
    actionsTaken: actionsTaken || null,
    daysAfterRecommendation: days,
  });

  return NextResponse.json({ outcome: row });
}
