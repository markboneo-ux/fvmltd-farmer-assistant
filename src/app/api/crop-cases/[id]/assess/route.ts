import { NextResponse } from "next/server";
import { runPreliminaryAssessment } from "@/lib/assessment/runAssessment";
import { ASSESSMENT_SELECT, mapAssessmentRow } from "@/lib/assessment/map";
import { asString, tryCreateAdminClient } from "@/lib/supabase/helpers";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

  const { data: cropCase } = await admin.client
    .from("crop_cases")
    .select("id")
    .eq("id", id)
    .eq("farmer_id", farmerId)
    .maybeSingle();

  if (!cropCase) {
    return NextResponse.json({ error: "Crop case not found." }, { status: 404 });
  }

  const { data, error } = await admin.client
    .from("ai_assessments")
    .select(ASSESSMENT_SELECT)
    .eq("crop_case_id", id)
    .order("assessed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Load assessment failed:", error);
    return NextResponse.json(
      { error: "Could not load assessment." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    assessment: data ? mapAssessmentRow(data) : null,
  });
}

export async function POST(request: Request, context: RouteContext) {
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
  const force = Boolean(body.force);

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

  const result = await runPreliminaryAssessment({
    client: admin.client,
    caseId: id,
    farmerId,
    force,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json(
    {
      assessment: result.assessment,
      created: result.created,
    },
    { status: result.created ? 201 : 200 },
  );
}
