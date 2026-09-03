import { NextResponse } from "next/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import {
  assertCaseOwned,
  CasePersistenceError,
  listFollowups,
  optOutFollowups,
  recordFollowupOutcome,
} from "@/lib/cases/store";
import { FOLLOWUP_OPTIONS, FOLLOWUP_PROMPT, parseFollowUpOutcome } from "@/lib/cases/followups";
import { logOps } from "@/lib/security/ops-log";
import { farmerFacingError } from "@/lib/beta/farmer-error";
import { FARMER_GENERIC_ERROR } from "@/lib/beta/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await resolveIdentityFromRequest();
  const caseId = new URL(request.url).searchParams.get("caseId");
  if (!caseId) {
    return NextResponse.json({ prompt: FOLLOWUP_PROMPT, options: FOLLOWUP_OPTIONS, followups: [] });
  }
  try {
    const owned = await assertCaseOwned(caseId, {
      userId: identity.authUserId,
      anonymousSessionId: identity.guestSessionId,
    });
    if (!owned) {
      return NextResponse.json({ error: "Case not found." }, { status: 404 });
    }
    return NextResponse.json({
      prompt: FOLLOWUP_PROMPT,
      options: FOLLOWUP_OPTIONS,
      followups: await listFollowups(caseId),
    });
  } catch (error) {
    if (error instanceof CasePersistenceError) {
      logOps("database_failure", { route: "followups" });
      return NextResponse.json({ error: FARMER_GENERIC_ERROR }, { status: 500 });
    }
    throw error;
  }
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
      const owned = await assertCaseOwned(caseId, {
        userId: identity.authUserId,
        anonymousSessionId: identity.guestSessionId,
      });
      if (!owned) return NextResponse.json({ error: "Case not found." }, { status: 404 });
      await optOutFollowups(caseId);
      return NextResponse.json({ ok: true, optedOut: true });
    }

    const outcome = parseFollowUpOutcome(String(body.outcome ?? ""));
    if (!outcome || typeof body.followupId !== "string") {
      return NextResponse.json({ error: "Choose how the crop is doing." }, { status: 400 });
    }

    const saved = await recordFollowupOutcome({
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
    if (error instanceof CasePersistenceError) {
      logOps("database_failure", { route: "followups" });
      return NextResponse.json({ error: FARMER_GENERIC_ERROR }, { status: 500 });
    }
    logOps("followup_failure", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return NextResponse.json(
      { error: farmerFacingError(null) },
      { status: 500 },
    );
  }
}
