import { NextResponse } from "next/server";
import { CROP_CASE_SELECT, mapCropCaseRow } from "@/lib/crop-check/map";
import type { GuidedQuestionStep } from "@/lib/crop-check/types";
import { GUIDED_QUESTION_STEPS } from "@/lib/crop-check/types";
import { validateGuidedAnswer } from "@/lib/crop-check/validation";
import { asString, tryCreateAdminClient } from "@/lib/supabase/helpers";

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

  const admin = tryCreateAdminClient();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 503 });
  }

  const { data, error } = await admin.client
    .from("crop_cases")
    .select(CROP_CASE_SELECT)
    .eq("id", id)
    .eq("farmer_id", farmerId)
    .maybeSingle();

  if (error) {
    console.error("Get crop case failed:", error);
    return NextResponse.json(
      { error: "Could not load crop case." },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ error: "Crop case not found." }, { status: 404 });
  }

  return NextResponse.json({ cropCase: mapCropCaseRow(data) });
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

  const admin = tryCreateAdminClient();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: 503 });
  }

  const { data: existing, error: existingError } = await admin.client
    .from("crop_cases")
    .select("id, farmer_id, status, guided_step")
    .eq("id", id)
    .eq("farmer_id", farmerId)
    .maybeSingle();

  if (existingError) {
    console.error("Crop case lookup failed:", existingError);
    return NextResponse.json(
      { error: "Could not update crop case." },
      { status: 500 },
    );
  }

  if (!existing) {
    return NextResponse.json({ error: "Crop case not found." }, { status: 404 });
  }

  if (existing.status !== "draft" || existing.guided_step === "completed") {
    return NextResponse.json(
      { error: "This crop check is already complete." },
      { status: 409 },
    );
  }

  if (existing.guided_step && existing.guided_step !== step) {
    return NextResponse.json(
      {
        error: `Expected step "${existing.guided_step}", not "${step}".`,
      },
      { status: 409 },
    );
  }

  const { data, error } = await admin.client
    .from("crop_cases")
    .update(validation.patch)
    .eq("id", id)
    .eq("farmer_id", farmerId)
    .select(CROP_CASE_SELECT)
    .single();

  if (error || !data) {
    console.error("Update crop case failed:", error);
    return NextResponse.json(
      { error: "Could not save your answer." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    cropCase: mapCropCaseRow(data),
    displayValue: validation.displayValue,
    nextStep: validation.nextStep,
  });
}
