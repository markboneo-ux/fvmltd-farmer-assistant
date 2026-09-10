import { NextResponse } from "next/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import {
  assertCaseOwned,
  CasePersistenceError,
  listCaseMessages,
} from "@/lib/cases/store";
import { FARMER_GENERIC_ERROR } from "@/lib/beta/limits";
import { logOps } from "@/lib/security/ops-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const identity = await resolveIdentityFromRequest();
  const { id } = await context.params;
  try {
    const owned = await assertCaseOwned(id, {
      userId: identity.authUserId,
      anonymousSessionId: identity.guestSessionId,
    });
    if (!owned) {
      return NextResponse.json({ error: "Case not found." }, { status: 404 });
    }
    const messages = await listCaseMessages(id);
    return NextResponse.json({
      case: {
        id: owned.id,
        crop: owned.crop,
        createdAt: owned.createdAt,
        issueSummary: owned.farmerProblemText,
        status: owned.caseStatus,
        solved: owned.caseStatus === "resolved",
      },
      messages: messages.map((item) => ({
        id: item.id,
        role: item.role,
        text: item.content,
      })),
    });
  } catch (error) {
    if (error instanceof CasePersistenceError) {
      logOps("database_failure", { route: "cases/[id]" });
      return NextResponse.json({ error: FARMER_GENERIC_ERROR }, { status: 503 });
    }
    throw error;
  }
}
