import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff/auth";
import { STAFF_ASSESSMENT_SELECT, mapStaffAssessmentRow } from "@/lib/staff/assessmentMap";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  let notes = "";
  try {
    const body = (await request.json()) as Record<string, unknown>;
    notes = typeof body.notes === "string" ? body.notes.trim() : "";
  } catch {
    // optional body
  }

  const { data: cropCase } = await auth.client
    .from("crop_cases")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();

  if (!cropCase) {
    return NextResponse.json({ error: "Crop case not found." }, { status: 404 });
  }

  const { data: assessment } = await auth.client
    .from("ai_assessments")
    .select("id")
    .eq("crop_case_id", id)
    .order("assessed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!assessment) {
    return NextResponse.json(
      { error: "No AI assessment exists to approve." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  const { data: updated, error } = await auth.client
    .from("ai_assessments")
    .update({
      staff_status: "approved",
      approved_by_staff_id: auth.staff.id,
      approved_at: now,
      staff_edit_notes: notes || null,
      human_review_required: false,
      product_recommendation_allowed: true,
    })
    .eq("id", assessment.id)
    .select(STAFF_ASSESSMENT_SELECT)
    .single();

  if (error || !updated) {
    console.error("Approve assessment failed:", error);
    return NextResponse.json(
      { error: "Could not approve the assessment." },
      { status: 500 },
    );
  }

  await auth.client
    .from("crop_cases")
    .update({
      status: "resolved",
      reviewed_at: now,
      reviewed_by_staff_id: auth.staff.id,
      awaiting_farmer_reply: false,
      resolved_at: now,
      assigned_staff_id: auth.staff.id,
      staff_notes: notes || null,
    })
    .eq("id", id);

  await auth.client
    .from("follow_ups")
    .update({ status: "completed", completed_at: now })
    .eq("crop_case_id", id)
    .eq("status", "pending");

  return NextResponse.json({
    assessment: mapStaffAssessmentRow(updated),
    message: "Assessment approved.",
  });
}
