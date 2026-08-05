import { connection } from "next/server";
import { NextResponse } from "next/server";
import {
  parseCaseRequestBody,
  runAgronomicCase,
  type CaseImageInput,
} from "@/lib/agronomy/runCase";
import { getOpenAIModel } from "@/lib/openai/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

async function parseImagesFromFormData(
  form: FormData,
): Promise<CaseImageInput[]> {
  const images: CaseImageInput[] = [];
  const entries = form.getAll("images");

  for (const entry of entries.slice(0, 3)) {
    if (!(entry instanceof File) || entry.size === 0) continue;
    const mimeType = entry.type || "image/jpeg";
    if (!ALLOWED_MIME.has(mimeType) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(entry.name)) {
      continue;
    }
    if (entry.size > 8_000_000) continue;

    const buffer = Buffer.from(await entry.arrayBuffer());
    images.push({
      mimeType: ALLOWED_MIME.has(mimeType) ? mimeType : "image/jpeg",
      base64: buffer.toString("base64"),
      fileName: entry.name,
    });
  }

  return images;
}

/**
 * Agronomic Case Engine — farmer-friendly rapid triage.
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
      const form = await request.formData();
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
      images = await parseImagesFromFormData(form);
    } else {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          {
            case: null,
            responseId: null,
            model,
            diagnosticCode: "INVALID_REQUEST",
            requestCompleted: false,
            error: "Invalid request body.",
          },
          { status: 400 },
        );
      }

      const parsed = parseCaseRequestBody(body);
      message = parsed.message;
      history = parsed.history;
      previousResponseId = parsed.previousResponseId;
      mode = parsed.mode;
      profile = parsed.profile;
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
    });
  } catch (error) {
    console.error("[ai/case] route failure", error);
    return NextResponse.json(
      {
        case: null,
        responseId: null,
        model,
        diagnosticCode: "OPENAI_REQUEST_FAILED",
        requestCompleted: false,
        error: "The AI case engine could not answer right now.",
      },
      { status: 502 },
    );
  }
}
