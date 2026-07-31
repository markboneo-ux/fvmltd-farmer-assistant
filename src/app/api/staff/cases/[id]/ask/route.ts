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

  const question = asString(body.question).trim();
  if (!question) {
    return NextResponse.json(
      { error: "Enter a question for the farmer." },
      { status: 400 },
    );
  }

  const { data: cropCase } = await auth.client
    .from("crop_cases")
    .select("id, farmer_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!cropCase) {
    return NextResponse.json({ error: "Crop case not found." }, { status: 404 });
  }

  const { data: message, error } = await auth.client
    .from("case_messages")
    .insert({
      crop_case_id: id,
      farmer_id: cropCase.farmer_id,
      author_type: "staff",
      staff_user_id: auth.staff.id,
      body: question,
      requires_reply: true,
    })
    .select(
      "id, author_type, staff_user_id, body, requires_reply, answered_at, created_at",
    )
    .single();

  if (error || !message) {
    console.error("Ask farmer failed:", error);
    return NextResponse.json(
      { error: "Could not send the question to the farmer." },
      { status: 500 },
    );
  }

  await auth.client
    .from("crop_cases")
    .update({
      status: "awaiting_info",
      awaiting_farmer_reply: true,
      assigned_staff_id: auth.staff.id,
    })
    .eq("id", id);

  await auth.client.from("follow_ups").insert({
    crop_case_id: id,
    farmer_id: cropCase.farmer_id,
    assigned_staff_id: auth.staff.id,
    title: "Awaiting farmer reply",
    notes: question,
    follow_up_type: "ask_farmer",
    status: "pending",
  });

  return NextResponse.json(
    {
      message: {
        id: message.id,
        authorType: message.author_type,
        staffUserId: message.staff_user_id,
        body: message.body,
        requiresReply: message.requires_reply,
        answeredAt: message.answered_at,
        createdAt: message.created_at,
      },
    },
    { status: 201 },
  );
}
