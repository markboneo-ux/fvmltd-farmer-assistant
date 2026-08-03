import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff/auth";
import { STAFF_ASSESSMENT_SELECT, mapStaffAssessmentRow } from "@/lib/staff/assessmentMap";
import { asString } from "@/lib/supabase/helpers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function asStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return items;
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const caseSummary = asString(body.caseSummary).trim();
  const likelyCauses = asStringList(body.likelyCauses);
  const immediateSafeActions = asStringList(body.immediateSafeActions);
  const missingInformation = asStringList(body.missingInformation);
  const urgencyRaw = asString(body.urgencyLevel).trim();
  const editNotes = asString(body.editNotes).trim();

  if (!caseSummary) {
    return NextResponse.json(
      { error: "Assessment summary is required." },
      { status: 400 },
    );
  }
  if (!likelyCauses?.length) {
    return NextResponse.json(
      { error: "At least one likely cause is required." },
      { status: 400 },
    );
  }

  const urgencyLevel =
    urgencyRaw === "low" ||
    urgencyRaw === "moderate" ||
    urgencyRaw === "high" ||
    urgencyRaw === "critical"
      ? urgencyRaw
      : null;

  if (!urgencyLevel) {
    return NextResponse.json(
      { error: "A valid urgency level is required." },
      { status: 400 },
    );
  }

  const { data: assessment } = await auth.client
    .from("assessment_results")
    .select("id")
    .eq("crop_check_id", id)
    .order("assessed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!assessment) {
    return NextResponse.json(
      { error: "No AI assessment exists to edit." },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  const { data: updated, error } = await auth.client
    .from("assessment_results")
    .update({
      staff_status: "edited",
      approved_by_staff_id: auth.staff.id,
      approved_at: now,
      staff_case_summary: caseSummary,
      staff_likely_causes: likelyCauses,
      staff_immediate_actions: immediateSafeActions ?? [],
      staff_missing_information: missingInformation ?? [],
      staff_urgency_level: urgencyLevel,
      staff_edit_notes: editNotes || null,
      human_review_required: false,
      product_recommendation_allowed: true,
      urgency_level: urgencyLevel,
    })
    .eq("id", assessment.id)
    .select(STAFF_ASSESSMENT_SELECT)
    .single();

  if (error || !updated) {
    console.error("Edit assessment failed:", error);
    return NextResponse.json(
      { error: "Could not save the edited assessment." },
      { status: 500 },
    );
  }

  await auth.client
    .from("crop_checks")
    .update({
      status: "resolved",
      reviewed_at: now,
      reviewed_by_staff_id: auth.staff.id,
      awaiting_farmer_reply: false,
      resolved_at: now,
      assigned_staff_id: auth.staff.id,
      staff_notes: editNotes || null,
    })
    .eq("id", id);

  await auth.client
    .from("follow_ups")
    .update({ status: "completed", completed_at: now })
    .eq("crop_check_id", id)
    .eq("status", "pending");

  return NextResponse.json({
    assessment: mapStaffAssessmentRow(updated),
    message: "Assessment updated and saved.",
  });
}
