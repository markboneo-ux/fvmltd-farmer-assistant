import { NextResponse } from "next/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import {
  assertCaseOwned,
  CasePersistenceError,
  casesForOwner,
  getCropCase,
  listFollowups,
  optOutFollowups,
  recordFollowupOutcome,
  updateCaseFromConversation,
} from "@/lib/cases/store";
import {
  FOLLOWUP_OPTIONS,
  FOLLOWED_RECOMMENDATION_OPTIONS,
  FOLLOWED_RECOMMENDATION_PROMPT,
  followUpPromptForCase,
  FOLLOWUP_PROMPT,
  parseFollowUpOutcome,
} from "@/lib/cases/followups";
import { logOps } from "@/lib/security/ops-log";
import { farmerFacingError } from "@/lib/beta/farmer-error";
import { FARMER_GENERIC_ERROR } from "@/lib/beta/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await resolveIdentityFromRequest();
  const url = new URL(request.url);
  const caseId = url.searchParams.get("caseId");
  const dueOnly = url.searchParams.get("due") === "1";

  try {
    if (!caseId) {
      const owned = await casesForOwner({
        userId: identity.authUserId,
        anonymousSessionId: identity.guestSessionId,
      });
      const ownedIds = new Set(owned.map((item) => item.id));
      const all = await listFollowups();
      const now = Date.now();
      const due = all.filter(
        (row) =>
          ownedIds.has(row.caseId) &&
          !row.outcome &&
          !row.optedOut &&
          new Date(row.followUpDate).getTime() <= now,
      );
      const first = due[0] ?? null;
      const record = first ? await getCropCase(first.caseId) : null;
      return NextResponse.json({
        prompt: record ? followUpPromptForCase(record) : FOLLOWUP_PROMPT,
        followedPrompt: FOLLOWED_RECOMMENDATION_PROMPT,
        options: FOLLOWUP_OPTIONS,
        followedOptions: FOLLOWED_RECOMMENDATION_OPTIONS,
        followups: dueOnly ? (first ? [first] : []) : due,
        due: first,
        channels: ["in_app"],
        plannedChannels: ["notification", "email", "whatsapp", "sms"],
      });
    }

    const owned = await assertCaseOwned(caseId, {
      userId: identity.authUserId,
      anonymousSessionId: identity.guestSessionId,
    });
    if (!owned) {
      return NextResponse.json({ error: "Case not found." }, { status: 404 });
    }
    return NextResponse.json({
      prompt: followUpPromptForCase(owned),
      followedPrompt: FOLLOWED_RECOMMENDATION_PROMPT,
      options: FOLLOWUP_OPTIONS,
      followedOptions: FOLLOWED_RECOMMENDATION_OPTIONS,
      followups: await listFollowups(caseId),
      channels: ["in_app"],
      plannedChannels: ["notification", "email", "whatsapp", "sms"],
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

    if (saved.caseId && (outcome === "worse" || outcome === "problem_solved")) {
      const current = await getCropCase(saved.caseId);
      if (current) {
        await updateCaseFromConversation(saved.caseId, current.farmerProblemText, {
          caseStatus: outcome === "worse" ? "in_progress" : "resolved",
          needsReview: outcome === "worse" ? true : current.needsReview,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      followup: saved,
      reopen: outcome === "worse",
      askWhatChanged: outcome === "improved",
    });
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
