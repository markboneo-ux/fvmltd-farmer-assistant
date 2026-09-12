import { NextResponse } from "next/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { casesForOwner, listCaseMessages } from "@/lib/cases/store";
import { farmerCaseDateLabel, farmerCaseTitle } from "@/lib/cases/farmer-title";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const identity = await resolveIdentityFromRequest();
  if (!identity.authUserId) {
    return NextResponse.json({ error: "Log in to see your crop cases." }, { status: 401 });
  }

  const owned = await casesForOwner({
    userId: identity.authUserId,
    anonymousSessionId: identity.guestSessionId,
  });
  const rows = await Promise.all(
    [...owned]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 50)
      .map(async (item) => {
        const messages = await listCaseMessages(item.id);
        return {
          id: item.id,
          title: farmerCaseTitle(item),
          dateLabel: farmerCaseDateLabel(item.updatedAt || item.createdAt),
          crop: item.crop,
          country: item.country,
          district: item.district,
          status: item.caseStatus,
          preview: item.farmerProblemText.slice(0, 120),
          messageCount: messages.length,
        };
      }),
  );

  return NextResponse.json({ cases: rows });
}
