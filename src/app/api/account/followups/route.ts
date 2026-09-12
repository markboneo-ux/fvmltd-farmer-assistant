import { NextResponse } from "next/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { casesForOwner, listFollowups } from "@/lib/cases/store";
import { farmerCaseTitle } from "@/lib/cases/farmer-title";
import { followUpStatusLabel } from "@/lib/cases/followups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await resolveIdentityFromRequest();
  if (!identity.authUserId) {
    return NextResponse.json({ error: "Log in to see follow-ups." }, { status: 401 });
  }

  const owned = await casesForOwner({
    userId: identity.authUserId,
    anonymousSessionId: identity.guestSessionId,
  });
  const byId = new Map(owned.map((item) => [item.id, item]));
  const followups = await listFollowups();
  const rows = followups
    .filter((row) => byId.has(row.caseId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((row) => {
      const cropCase = byId.get(row.caseId)!;
      return {
        id: row.id,
        caseId: row.caseId,
        title: farmerCaseTitle(cropCase),
        followUpDate: row.followUpDate,
        outcome: row.outcome,
        status: followUpStatusLabel({
          outcome: row.outcome,
          optedOut: row.optedOut,
          followUpDate: row.followUpDate,
          askedAt: row.askedAt,
        }),
      };
    });

  return NextResponse.json({ followups: rows });
}
