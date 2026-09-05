import { connection } from "next/server";
import { NextResponse } from "next/server";
import {
  parseCaseRequestBody,
  runAgronomicCase,
  type CaseImageInput,
} from "@/lib/agronomy/runCase";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { loadRegisteredFarmerContext } from "@/lib/beta/farmer-profile-context";
import { mergeCaseProfileContext } from "@/lib/assistant/farmer-context";
import {
  CasePersistenceError,
  evaluateConversationGate,
  loadPersistedConversationHistory,
  persistConversationTurn,
  resolveContinuingCropCase,
  similarCaseHint,
} from "@/lib/beta/conversation";
import { farmerFacingError } from "@/lib/beta/farmer-error";
import { persistActiveCaseId, readActiveCaseId } from "@/lib/beta/session";
import { shouldStartNewCase } from "@/lib/assistant/intents";
import {
  logCasePersistenceBackend,
  logCasePersistenceError,
  logCasePersistenceStart,
  getCropCase,
} from "@/lib/cases/store";
import {
  FARMER_GENERIC_ERROR,
  GUEST_LIMIT_MESSAGE,
  REGISTERED_LIMIT_HEADING,
} from "@/lib/beta/limits";
import { recordUsageEvent } from "@/lib/beta/usage-store";
import { persistPrivateCaseImages } from "@/lib/cases/photo-persist";
import { farmerHistoryContent } from "@/lib/chat/visible-reply";
import {
  CASE_IMAGE_MAX_COUNT,
  FARMER_PHOTO_TOO_LARGE,
  FARMER_PHOTO_UNSUPPORTED,
  FARMER_PHOTO_UPLOAD_FAILED,
  normalizeImageMimeType,
  validateCaseImageMeta,
} from "@/lib/chat/case-images";
import { getOpenAIModel } from "@/lib/openai/env";
import {
  checkCombinedRateLimit,
  clientIp,
  FARMER_RATE_LIMIT_MESSAGE,
  RATE_LIMITS,
} from "@/lib/security/rate-limit";
import { logOps } from "@/lib/security/ops-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ImageParseResult =
  | { ok: true; images: CaseImageInput[] }
  | { ok: false; farmerError: string };

function logImageIssue(reason: string, extra?: Record<string, string | number>) {
  console.error("[ai/case] image rejected", { reason, ...extra });
}

async function parseImagesFromFormData(form: FormData): Promise<ImageParseResult> {
  const images: CaseImageInput[] = [];
  const entries = form.getAll("images");
  const offered = entries.filter((entry) => entry instanceof File && entry.size >= 0);

  if (offered.length === 0) {
    return { ok: true, images };
  }

  for (const entry of offered.slice(0, CASE_IMAGE_MAX_COUNT)) {
    if (!(entry instanceof File)) continue;

    const check = validateCaseImageMeta({
      name: entry.name,
      type: entry.type,
      size: entry.size,
    });
    if (!check.ok) {
      logImageIssue(check.reason, { fileName: entry.name, size: entry.size });
      return { ok: false, farmerError: check.farmerError };
    }

    try {
      const buffer = Buffer.from(await entry.arrayBuffer());
      images.push({
        mimeType: normalizeImageMimeType(entry.type || "image/jpeg", entry.name),
        base64: buffer.toString("base64"),
        fileName: entry.name,
      });
    } catch (error) {
      logImageIssue("read_failed", {
        fileName: entry.name,
        size: entry.size,
      });
      console.error("[ai/case] image read failure", error);
      return { ok: false, farmerError: FARMER_PHOTO_UPLOAD_FAILED };
    }
  }

  if (offered.length > 0 && images.length === 0) {
    logImageIssue("no_images_accepted", { offered: offered.length });
    return { ok: false, farmerError: FARMER_PHOTO_UPLOAD_FAILED };
  }

  return { ok: true, images };
}

function jsonError(
  model: string,
  diagnosticCode: string,
  error: string,
  status: number,
  extras?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      case: null,
      responseId: null,
      requestCompleted: false,
      error: farmerFacingError(error),
      ...extras,
    },
    { status },
  );
}

/**
 * Agronomic Case Engine — conversational crop assistant.
 * Accepts JSON or multipart (text + up to 3 photos).
 * Quick Help images are processed in-memory (no permanent storage).
 */
export async function POST(request: Request) {
  await connection();
  logCasePersistenceBackend();

  const apiKey = process.env.OPENAI_API_KEY;
  const model = getOpenAIModel();
  const includeDiagnostics =
    request.headers.get("x-fvm-debug") === "1" ||
    request.headers.get("referer")?.includes("/ai-lab") === true;
  const identity = await resolveIdentityFromRequest();
  const rate = checkCombinedRateLimit({
    rule: RATE_LIMITS.ai,
    sessionId: identity.guestSessionId,
    userId: identity.authUserId,
    ip: clientIp(request),
  });
  if (!rate.ok) {
    logOps("rate_limit", { route: "ai/case", retryAfterSec: rate.retryAfterSec });
    return jsonError(model, "OPENAI_RATE_LIMIT", FARMER_RATE_LIMIT_MESSAGE, 429);
  }

  const contentType = request.headers.get("content-type") || "";
  let incomingCaseId: string | null = null;

  try {
    let message = "";
    let history: ReturnType<typeof parseCaseRequestBody>["history"] = [];
    let previousResponseId: string | null = null;
    let mode: ReturnType<typeof parseCaseRequestBody>["mode"] = "quick_help";
    let profile: ReturnType<typeof parseCaseRequestBody>["profile"] = {};
    let images: CaseImageInput[] = [];

    if (contentType.includes("multipart/form-data")) {
      let form: FormData;
      try {
        form = await request.formData();
      } catch (error) {
        console.error("[ai/case] multipart parse failure", error);
        return jsonError(
          model,
          "INVALID_REQUEST",
          FARMER_PHOTO_TOO_LARGE,
          413,
        );
      }

      message = String(form.get("message") || form.get("question") || "").trim();
      previousResponseId = String(
        form.get("previousResponseId") || form.get("previous_response_id") || "",
      ).trim() || null;
      const modeRaw = String(form.get("mode") || "quick_help");
      const messagesRaw = String(form.get("messages") || form.get("history") || "[]");
      const profileRaw = String(form.get("profile") || "{}");

      let parsedBody: unknown = {
        message,
        previousResponseId,
        mode: modeRaw,
        messages: [],
        profile: {},
      };

      try {
        const messages = JSON.parse(messagesRaw);
        const profileObj = JSON.parse(profileRaw);
        parsedBody = {
          message,
          previousResponseId,
          mode: modeRaw,
          messages,
          profile: profileObj,
        };
      } catch {
        // keep defaults
      }

      const parsed = parseCaseRequestBody(parsedBody);
      message = parsed.message;
      history = parsed.history;
      previousResponseId = parsed.previousResponseId;
      mode = parsed.mode;
      profile = parsed.profile;

      incomingCaseId = String(form.get("caseId") || "").trim() || null;
      const parsedImages = await parseImagesFromFormData(form);
      if (!parsedImages.ok) {
        logOps("photo_upload_failure", { reason: parsedImages.farmerError });
        return jsonError(model, "INVALID_REQUEST", parsedImages.farmerError, 400);
      }
      images = parsedImages.images;
    } else {
      let body: unknown;
      try {
        body = await request.json();
      } catch (error) {
        console.error("[ai/case] json parse failure", error);
        const bodyBytes = Number(request.headers.get("content-length") || 0);
        const looksLikePhoto =
          contentType.includes("application/json") && bodyBytes > 3_500_000;
        return jsonError(
          model,
          "INVALID_REQUEST",
          looksLikePhoto ? FARMER_PHOTO_TOO_LARGE : "Invalid request body.",
          400,
        );
      }

      const parsed = parseCaseRequestBody(body);
      message = parsed.message;
      history = parsed.history;
      previousResponseId = parsed.previousResponseId;
      mode = parsed.mode;
      profile = parsed.profile;

      for (const image of parsed.images) {
        const check = validateCaseImageMeta({
          name: image.fileName,
          type: image.mimeType,
          size: Math.ceil((image.base64.length * 3) / 4),
        });
        if (!check.ok) {
          logImageIssue(check.reason, { fileName: image.fileName || "" });
          return jsonError(model, "INVALID_REQUEST", check.farmerError, 400);
        }
      }
      images = parsed.images;
      const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
      incomingCaseId =
        typeof record.caseId === "string" ? record.caseId.trim() || null : incomingCaseId;
    }

    incomingCaseId = await resolveContinuingCropCase({
      identity,
      requestedCaseId: incomingCaseId ?? (await readActiveCaseId()),
    });

    const continuingCase = incomingCaseId ? await getCropCase(incomingCaseId) : null;
    const registeredProfile = await loadRegisteredFarmerContext(identity.farmerProfileId);
    const topicReset = Boolean(
      continuingCase &&
        shouldStartNewCase({
          message,
          activeCrop: continuingCase.crop,
          activeIntent: continuingCase.conversationIntent,
        }),
    );
    if (topicReset) {
      incomingCaseId = null;
      history = [];
      previousResponseId = null;
    }
    const storedConfidence = continuingCase?.businessMetadata?.locationConfidence;
    profile = mergeCaseProfileContext({
      client: profile,
      continuing:
        !topicReset && continuingCase
          ? {
              country: continuingCase.country,
              district: continuingCase.district,
              locationConfidence:
                storedConfidence === "explicit" ||
                storedConfidence === "profile_confirmed" ||
                storedConfidence === "conversation_inferred" ||
                storedConfidence === "unknown"
                  ? storedConfidence
                  : null,
            }
          : null,
      registered: registeredProfile,
    });

    const persistedHistory = await loadPersistedConversationHistory(
      incomingCaseId,
      message,
    );
    if (persistedHistory && persistedHistory.length > 0) {
      history = persistedHistory;
    }

    const imageGate =
      images.length > 0
        ? await evaluateConversationGate({ identity, next: "image_analysis" })
        : await evaluateConversationGate({
            identity,
            next: incomingCaseId ? "message" : "case",
          });
    if (!imageGate.ok && !imageGate.allowFinishActiveCase) {
      recordUsageEvent({
        guestSessionId: identity.guestSessionId,
        authUserId: identity.authUserId,
        kind: "usage_limit",
        caseId: incomingCaseId,
      });
      logOps("usage_limit", { access: identity.access });
      return NextResponse.json(
        {
          case: null,
          responseId: null,
          requestCompleted: false,
          error:
            identity.access === "guest" ? GUEST_LIMIT_MESSAGE : REGISTERED_LIMIT_HEADING,
          usage: imageGate.used,
          remaining: imageGate.remaining,
          access: identity.access,
          limitReached: true,
          reason: imageGate.reason,
        },
        { status: 402 },
      );
    }

    if (images.length > 0) {
      const imageRate = checkCombinedRateLimit({
        rule: RATE_LIMITS.image,
        sessionId: identity.guestSessionId,
        userId: identity.authUserId,
        ip: clientIp(request),
      });
      if (!imageRate.ok) {
        logOps("rate_limit", { route: "ai/case-image" });
        return jsonError(model, "OPENAI_RATE_LIMIT", FARMER_RATE_LIMIT_MESSAGE, 429);
      }
    }

    const result = await runAgronomicCase({
      message,
      history,
      previousResponseId,
      mode,
      profile,
      images,
      apiKey,
      activeCase:
        !topicReset && continuingCase
          ? {
              crop: continuingCase.crop,
              conversationIntent: continuingCase.conversationIntent,
              farmerProblemText: continuingCase.farmerProblemText,
              country: continuingCase.country,
              district: continuingCase.district,
              farmerLevel: continuingCase.userLevel,
            }
          : null,
    });

    if (!result.ok) {
      logOps("openai_failure", { diagnosticCode: result.diagnosticCode });
      return NextResponse.json(
        {
          case: null,
          responseId: null,
          requestCompleted: result.requestCompleted,
          error: farmerFacingError(result.error) || FARMER_GENERIC_ERROR,
          ...(includeDiagnostics
            ? { model: result.model, diagnosticCode: result.diagnosticCode }
            : {}),
        },
        { status: result.status },
      );
    }

    const assistantText = farmerHistoryContent(result.case);
    logCasePersistenceStart();
    const persisted = await persistConversationTurn({
      identity,
      caseId: incomingCaseId,
      userMessage: message,
      assistantText,
      payload: result.case,
      imageCount: images.length,
      profile,
    });
    await persistActiveCaseId(persisted.caseId);
    if (images.length > 0) {
      await persistPrivateCaseImages({
        caseId: persisted.caseId,
        identity,
        images,
      });
    }

    return NextResponse.json({
      case: result.case,
      responseId: result.responseId,
      requestCompleted: result.requestCompleted,
      questionsAsked: result.questionsAsked,
      caseId: persisted.caseId,
      similarCaseHint: await similarCaseHint(persisted.caseId),
      access: identity.access,
      usage: imageGate.used,
      ...(includeDiagnostics
        ? { model: result.model, diagnosticCode: result.diagnosticCode }
        : {}),
    });
  } catch (error) {
    if (error instanceof CasePersistenceError) {
      logCasePersistenceError(error, error.table);
      logOps("database_failure", {
        error: error.message,
        table: error.table,
      });
      return NextResponse.json(
        {
          case: null,
          responseId: null,
          requestCompleted: false,
          error: FARMER_GENERIC_ERROR,
          ...(includeDiagnostics
            ? { model, diagnosticCode: "DATABASE_FAILURE" }
            : {}),
        },
        { status: 503 },
      );
    }
    logOps("openai_failure", {
      error: error instanceof Error ? error.message : String(error),
    });
    const messageText = error instanceof Error ? error.message : String(error);
    const farmerError =
      /payload|too large|413|body/i.test(messageText)
        ? FARMER_PHOTO_TOO_LARGE
        : /unsupported|mime|file type/i.test(messageText)
          ? FARMER_PHOTO_UNSUPPORTED
          : FARMER_GENERIC_ERROR;
    return NextResponse.json(
      {
        case: null,
        responseId: null,
        requestCompleted: false,
        error: farmerError,
        ...(includeDiagnostics
          ? { model, diagnosticCode: "OPENAI_REQUEST_FAILED" }
          : {}),
      },
      { status: /413|too large/i.test(messageText) ? 413 : 502 },
    );
  }
}
