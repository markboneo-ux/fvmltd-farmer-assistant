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
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const requestTypeRaw = asString(body.requestType).trim().toLowerCase();
  const requestType =
    requestTypeRaw === "laboratory" || requestTypeRaw === "lab"
      ? "laboratory"
      : requestTypeRaw === "soil"
        ? "soil"
        : null;
  const notes = asString(body.notes).trim();

  if (!requestType) {
    return NextResponse.json(
      { error: "requestType must be soil or laboratory." },
      { status: 400 },
    );
  }

  const { data: cropCase } = await auth.client
    .from("crop_checks")
    .select("id, farmer_id, farm_id")
    .eq("id", id)
    .maybeSingle();

  if (!cropCase) {
    return NextResponse.json({ error: "Crop case not found." }, { status: 404 });
  }

  const { data: labRequest, error } = await auth.client
    .from("lab_test_requests")
    .insert({
      crop_check_id: id,
      farmer_id: cropCase.farmer_id,
      farm_id: cropCase.farm_id,
      requested_by_staff_id: auth.staff.id,
      request_type: requestType,
      status: "requested",
      notes: notes || null,
    })
    .select("id, request_type, status, notes, created_at, due_at")
    .single();

  if (error || !labRequest) {
    console.error("Lab/soil request failed:", error);
    return NextResponse.json(
      { error: "Could not create the test request." },
      { status: 500 },
    );
  }

  if (requestType === "laboratory") {
    await auth.client
      .from("assessment_results")
      .update({ laboratory_test_needed: true })
      .eq("crop_check_id", id);
  }

  await auth.client.from("follow_ups").insert({
    crop_check_id: id,
    farmer_id: cropCase.farmer_id,
    assigned_staff_id: auth.staff.id,
    title:
      requestType === "soil"
        ? "Soil test requested"
        : "Laboratory test requested",
    notes: notes || null,
    follow_up_type: requestType === "soil" ? "soil_test" : "lab_test",
    status: "pending",
  });

  await auth.client.from("chat_messages").insert({
    crop_check_id: id,
    farmer_id: cropCase.farmer_id,
    role: "system",
    content:
      requestType === "soil"
        ? "FVMLTD staff requested a soil test for this farm."
        : "FVMLTD staff requested a laboratory test for this case.",
    author_type: "system",
    staff_profile_id: auth.staff.id,
    body:
      requestType === "soil"
        ? "FVMLTD staff requested a soil test for this farm."
        : "FVMLTD staff requested a laboratory test for this case.",
    requires_reply: false,
  });

  await auth.client
    .from("crop_checks")
    .update({
      status: "awaiting_info",
      awaiting_farmer_reply: true,
      assigned_staff_id: auth.staff.id,
    })
    .eq("id", id);

  return NextResponse.json(
    {
      request: {
        id: labRequest.id,
        requestType: labRequest.request_type,
        status: labRequest.status,
        notes: labRequest.notes,
        createdAt: labRequest.created_at,
        dueAt: labRequest.due_at,
      },
    },
    { status: 201 },
  );
}
