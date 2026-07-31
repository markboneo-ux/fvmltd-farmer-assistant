import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff/auth";
import { asString } from "@/lib/supabase/helpers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // optional
  }

  const reason = asString(body.reason).trim();
  const now = new Date().toISOString();

  const { data: existing } = await auth.client
    .from("crop_cases")
    .select("id, farmer_id")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Crop case not found." }, { status: 404 });
  }

  const { data: cropCase, error } = await auth.client
    .from("crop_cases")
    .update({
      status: "closed",
      closed_reason: reason || null,
      resolved_at: now,
      reviewed_at: now,
      reviewed_by_staff_id: auth.staff.id,
      assigned_staff_id: auth.staff.id,
      awaiting_farmer_reply: false,
      is_urgent: false,
    })
    .eq("id", id)
    .select("id, status, closed_reason, resolved_at")
    .single();

  if (error || !cropCase) {
    console.error("Close case failed:", error);
    return NextResponse.json(
      { error: "Could not close the case." },
      { status: 500 },
    );
  }

  await auth.client
    .from("follow_ups")
    .update({ status: "cancelled", completed_at: now })
    .eq("crop_case_id", id)
    .in("status", ["pending", "in_progress"]);

  await auth.client.from("case_messages").insert({
    crop_case_id: id,
    farmer_id: existing.farmer_id,
    author_type: "system",
    staff_user_id: auth.staff.id,
    body: reason
      ? `Case closed by FVMLTD staff: ${reason}`
      : "Case closed by FVMLTD staff.",
    requires_reply: false,
  });

  return NextResponse.json({
    id: cropCase.id,
    status: cropCase.status,
    closedReason: cropCase.closed_reason,
    resolvedAt: cropCase.resolved_at,
    message: "Case closed.",
  });
}
