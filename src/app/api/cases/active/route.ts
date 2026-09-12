import { NextResponse } from "next/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import {
  assertCaseOwned,
  findActiveCropCaseForOwner,
  listCaseMessages,
  listCaseAssessments,
} from "@/lib/cases/store";
import {
  CASE_COOKIE_NAME,
  guestCookieOptions,
  persistActiveCaseId,
  readActiveCaseCookie,
} from "@/lib/beta/session";
import { farmerHistoryContent } from "@/lib/chat/visible-reply";
import type { AgronomicCasePayload } from "@/lib/agronomy/case-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const identity = await resolveIdentityFromRequest();
  const url = new URL(request.url);
  const requested = url.searchParams.get("caseId");
  const owner = {
    userId: identity.authUserId,
    anonymousSessionId: identity.guestSessionId,
  };

  let record = requested ? await assertCaseOwned(requested, owner) : null;
  if (requested && !record) {
    return NextResponse.json({ caseId: null, messages: [] });
  }

  if (!record) {
    const cookie = await readActiveCaseCookie();
    if (cookie.kind === "new") {
      return NextResponse.json({ caseId: null, messages: [] });
    }
    if (cookie.kind === "id") {
      record = await assertCaseOwned(cookie.id, owner);
    }
    if (!record) {
      record = await findActiveCropCaseForOwner(owner);
    }
  }
  if (!record) {
    return NextResponse.json({ caseId: null, messages: [] });
  }

  await persistActiveCaseId(record.id);
  const stored = await listCaseMessages(record.id);
  const assessments = await listCaseAssessments(record.id);
  const assistantPayloads = assessments
    .filter((row) => row.payload)
    .map((row) => row.payload as unknown as AgronomicCasePayload);
  let assistantIndex = 0;

  const messages = stored
    .filter((item) => item.role === "user" || item.role === "assistant")
    .map((item) => {
      if (item.role !== "assistant") {
        return {
          id: item.id,
          role: item.role,
          text: item.content,
          casePayload: null as AgronomicCasePayload | null,
        };
      }
      const payload =
        assistantPayloads[assistantIndex] ?? assistantPayloads.at(-1) ?? null;
      assistantIndex += 1;
      return {
        id: item.id,
        role: item.role,
        text:
          payload && typeof payload.preliminaryAssessment === "string"
            ? farmerHistoryContent(payload)
            : item.content,
        casePayload: payload,
      };
    });

  const response = NextResponse.json({
    caseId: record.id,
    country: record.country,
    district: record.district,
    messages,
  });
  response.cookies.set(CASE_COOKIE_NAME, record.id, guestCookieOptions());
  return response;
}
