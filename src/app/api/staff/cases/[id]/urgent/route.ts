import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff/auth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  let urgent = true;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (typeof body.urgent === "boolean") {
      urgent = body.urgent;
    }
  } catch {
    // default mark urgent
  }

  const { data: cropCase, error } = await auth.client
    .from("crop_cases")
    .update({
      is_urgent: urgent,
      assigned_staff_id: auth.staff.id,
    })
    .eq("id", id)
    .select("id, is_urgent")
    .maybeSingle();

  if (error) {
    console.error("Mark urgent failed:", error);
    return NextResponse.json(
      { error: "Could not update urgency." },
      { status: 500 },
    );
  }
  if (!cropCase) {
    return NextResponse.json({ error: "Crop case not found." }, { status: 404 });
  }

  if (urgent) {
    const { data: assessment } = await auth.client
      .from("ai_assessments")
      .select("id, urgency_level")
      .eq("crop_case_id", id)
      .order("assessed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (
      assessment &&
      assessment.urgency_level !== "high" &&
      assessment.urgency_level !== "critical"
    ) {
      await auth.client
        .from("ai_assessments")
        .update({ urgency_level: "high" })
        .eq("id", assessment.id);
    }
  }

  return NextResponse.json({
    id: cropCase.id,
    isUrgent: cropCase.is_urgent,
    message: urgent ? "Case marked urgent." : "Urgent flag cleared.",
  });
}
