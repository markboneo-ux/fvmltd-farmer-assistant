import { NextResponse } from "next/server";
import { runPreliminaryAssessment } from "@/lib/assessment/runAssessment";
import { mapAssessmentRow } from "@/lib/assessment/map";
import {
  asString,
  describeFarmerRpcError,
  tryCreateAnonServerClient,
} from "@/lib/supabase/helpers";

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

  const anon = tryCreateAnonServerClient();
  if (!anon.ok) {
    return NextResponse.json({ error: anon.error }, { status: 503 });
  }

  const { data, error } = await anon.client.rpc("get_assessment_for_farmer", {
    p_farmer_id: farmerId,
    p_check_id: id,
  });

  if (error) {
    console.error("Load assessment failed:", error);
    const message = describeFarmerRpcError(error, "Could not load assessment.");
    return NextResponse.json(
      { error: message },
      { status: message.toLowerCase().includes("not found") ? 404 : 500 },
    );
  }

  return NextResponse.json({
    assessment:
      data && typeof data === "object"
        ? mapAssessmentRow(data as Parameters<typeof mapAssessmentRow>[0])
        : null,
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

  const anon = tryCreateAnonServerClient();
  if (!anon.ok) {
    return NextResponse.json({ error: anon.error }, { status: 503 });
  }

  const result = await runPreliminaryAssessment({
    client: anon.client,
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
