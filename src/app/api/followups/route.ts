import { NextResponse } from "next/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { assertCaseOwned, listFollowups, optOutFollowups, recordFollowupOutcome } from "@/lib/cases/store";
import { FOLLOWUP_OPTIONS, FOLLOWUP_PROMPT, parseFollowUpOutcome } from "@/lib/cases/followups";
import { logOps } from "@/lib/security/ops-log";
import { farmerFacingError } from "@/lib/beta/farmer-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await resolveIdentityFromRequest();
  const caseId = new URL(request.url).searchParams.get("caseId");
  if (!caseId) {
    return NextResponse.json({ prompt: FOLLOWUP_PROMPT, options: FOLLOWUP_OPTIONS, followups: [] });
  }
  const owned = assertCaseOwned(caseId, {
    userId: identity.authUserId,
    anonymousSessionId: identity.guestSessionId,
  });
  if (!owned) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }
  return NextResponse.json({
    prompt: FOLLOWUP_PROMPT,
    options: FOLLOWUP_OPTIONS,
    followups: listFollowups(caseId),
  });
}

export async function POST(request: Request) {
  const identity = await resolveIdentityFromRequest();
  try {
    const body = (await request.json()) as {
      followupId?: unknown;
      caseId?: unknown;
      outcome?: unknown;
      actionTaken?: unknown;
      notes?: unknown;
      optOut?: unknown;
    };

    const caseId = typeof body.caseId === "string" ? body.caseId : "";
    if (body.optOut && caseId) {
      const owned = assertCaseOwned(caseId, {
        userId: identity.authUserId,
        anonymousSessionId: identity.guestSessionId,
      });
      if (!owned) return NextResponse.json({ error: "Case not found." }, { status: 404 });
      optOutFollowups(caseId);
      return NextResponse.json({ ok: true, optedOut: true });
    }

    const outcome = parseFollowUpOutcome(String(body.outcome ?? ""));
    if (!outcome || typeof body.followupId !== "string") {
      return NextResponse.json({ error: "Choose how the crop is doing." }, { status: 400 });
    }

    const saved = recordFollowupOutcome({
      followupId: body.followupId,
      outcome,
      actionTaken: typeof body.actionTaken === "string" ? body.actionTaken : null,
      notes: typeof body.notes === "string" ? body.notes : null,
    });
    if (!saved) {
      return NextResponse.json({ error: "Follow-up not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, followup: saved });
  } catch (error) {
    logOps("followup_failure", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: farmerFacingError(null) },
      { status: 500 },
    );
  }
}
