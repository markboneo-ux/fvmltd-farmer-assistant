import { NextResponse } from "next/server";
import { mapCropCaseRow } from "@/lib/crop-check/map";
import type { GuidedQuestionStep } from "@/lib/crop-check/types";
import { GUIDED_QUESTION_STEPS } from "@/lib/crop-check/types";
import { validateGuidedAnswer } from "@/lib/crop-check/validation";
import {
  asString,
  describeFarmerRpcError,
  firstRpcRow,
  tryCreateAnonServerClient,
} from "@/lib/supabase/helpers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function isGuidedStep(value: string): value is GuidedQuestionStep {
  return (GUIDED_QUESTION_STEPS as readonly string[]).includes(value);
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const farmerId = new URL(request.url).searchParams.get("farmerId")?.trim();

  if (!farmerId) {
    return NextResponse.json(
      { error: "farmerId is required." },
      { status: 400 },
    );
  }

  const anon = tryCreateAnonServerClient();
  if (!anon.ok) {
    return NextResponse.json({ error: anon.error }, { status: 503 });
  }

  const { data, error } = await anon.client.rpc("get_crop_check_for_farmer", {
    p_farmer_id: farmerId,
    p_check_id: id,
  });

  if (error) {
    console.error("Get crop case failed:", error);
    return NextResponse.json(
      { error: describeFarmerRpcError(error, "Could not load crop case.") },
      { status: 500 },
    );
  }

  const row = firstRpcRow<Parameters<typeof mapCropCaseRow>[0]>(data);
  if (!row) {
    return NextResponse.json({ error: "Crop case not found." }, { status: 404 });
  }

  return NextResponse.json({ cropCase: mapCropCaseRow(row) });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const farmerId = asString(body.farmerId).trim();
  const step = asString(body.step).trim();
  const answer = body.answer;

  if (!farmerId) {
    return NextResponse.json(
      { error: "farmerId is required." },
      { status: 400 },
    );
  }
  if (!isGuidedStep(step) || step === "completed" || step === "photos") {
    return NextResponse.json(
      { error: "A valid guided question step is required." },
      { status: 400 },
    );
  }

  const validation = validateGuidedAnswer(step, answer);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const anon = tryCreateAnonServerClient();
  if (!anon.ok) {
    return NextResponse.json({ error: anon.error }, { status: 503 });
  }

  const { data, error } = await anon.client.rpc("save_crop_check_guided_answer", {
    p_farmer_id: farmerId,
    p_check_id: id,
    p_expected_step: step,
    p_patch: validation.patch,
  });

  const row = firstRpcRow<Parameters<typeof mapCropCaseRow>[0]>(data);
  if (error || !row) {
    console.error("Update crop case failed:", error);
    const message = describeFarmerRpcError(
      error,
      "Could not save your answer.",
    );
    const conflict =
      message.toLowerCase().includes("already complete") ||
      message.toLowerCase().includes("expected step");
    const notFound = message.toLowerCase().includes("not found");
    return NextResponse.json(
      { error: message },
      { status: notFound ? 404 : conflict ? 409 : 500 },
    );
  }

  return NextResponse.json({
    cropCase: mapCropCaseRow(row),
    displayValue: validation.displayValue,
    nextStep: validation.nextStep,
  });
}
