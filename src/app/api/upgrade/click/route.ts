import { NextResponse } from "next/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { paymentProcessorConfigured } from "@/lib/beta/entitlements";
import { UPGRADE_COMING_SOON } from "@/lib/beta/limits";
import { recordUsageEvent } from "@/lib/beta/usage-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await resolveIdentityFromRequest();
  const body = (await request.json().catch(() => ({}))) as { view?: unknown };
  const viewOnly = body.view === true;

  recordUsageEvent({
    guestSessionId: identity.guestSessionId,
    authUserId: identity.authUserId,
    kind: viewOnly ? "upgrade_view" : "upgrade_click",
    caseId: null,
  });

  if (viewOnly) {
    return NextResponse.json({ ok: true });
  }

  if (!paymentProcessorConfigured()) {
    return NextResponse.json({
      ok: true,
      paid: false,
      message: UPGRADE_COMING_SOON,
    });
  }

  return NextResponse.json({
    ok: true,
    paid: false,
    message: UPGRADE_COMING_SOON,
  });
}
