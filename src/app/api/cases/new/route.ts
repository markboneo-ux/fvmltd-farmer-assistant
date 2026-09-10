import { NextResponse } from "next/server";
import {
  CASE_COOKIE_NAME,
  clearActiveCaseId,
  guestCookieOptions,
} from "@/lib/beta/session";
import { NEW_CONVERSATION_COOKIE_VALUE } from "@/lib/beta/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await clearActiveCaseId();
  const response = NextResponse.json({ ok: true, caseId: null });
  response.cookies.set(
    CASE_COOKIE_NAME,
    NEW_CONVERSATION_COOKIE_VALUE,
    guestCookieOptions(),
  );
  return response;
}
