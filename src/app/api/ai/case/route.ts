import { connection } from "next/server";
import { NextResponse } from "next/server";
import {
  parseCaseRequestBody,
  runAgronomicCase,
  type CaseImageInput,
} from "@/lib/agronomy/runCase";
import {
  CASE_IMAGE_MAX_COUNT,
  FARMER_PHOTO_TOO_LARGE,
  FARMER_PHOTO_UNSUPPORTED,
  FARMER_PHOTO_UPLOAD_FAILED,
  normalizeImageMimeType,
  validateCaseImageMeta,
} from "@/lib/chat/case-images";
import { getOpenAIModel } from "@/lib/openai/env";

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
) {
  return NextResponse.json(
    {
      case: null,
      responseId: null,
      model,
      diagnosticCode,
      requestCompleted: false,
      error,
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

  const apiKey = process.env.OPENAI_API_KEY;
  const model = getOpenAIModel();

  const contentType = request.headers.get("content-type") || "";

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

      const parsedImages = await parseImagesFromFormData(form);
      if (!parsedImages.ok) {
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
    }

    const result = await runAgronomicCase({
      message,
      history,
      previousResponseId,
      mode,
      profile,
      images,
      apiKey,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          case: null,
          responseId: null,
          model: result.model,
          diagnosticCode: result.diagnosticCode,
          requestCompleted: result.requestCompleted,
          error: result.error,
        },
        { status: result.status },
      );
    }

    // Never expose internalMissingInformation is handled by UI;
    // still return full structured case for the client engine.
    return NextResponse.json({
      case: result.case,
      responseId: result.responseId,
      model: result.model,
      diagnosticCode: result.diagnosticCode,
      requestCompleted: result.requestCompleted,
      questionsAsked: result.questionsAsked,
      caseId: result.caseId,
      followUpDue: result.followUpDue,
    });
  } catch (error) {
    console.error("[ai/case] route failure", error);
    const messageText = error instanceof Error ? error.message : String(error);
    const farmerError =
      /payload|too large|413|body/i.test(messageText)
        ? FARMER_PHOTO_TOO_LARGE
        : /unsupported|mime|file type/i.test(messageText)
          ? FARMER_PHOTO_UNSUPPORTED
          : "The AI case engine could not answer right now.";
    return NextResponse.json(
      {
        case: null,
        responseId: null,
        model,
        diagnosticCode: "OPENAI_REQUEST_FAILED",
        requestCompleted: false,
        error: farmerError,
      },
      { status: /413|too large/i.test(messageText) ? 413 : 502 },
    );
  }
}
