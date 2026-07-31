import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff/auth";
import { getStaffCaseDetail } from "@/lib/staff/cases";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    const detail = await getStaffCaseDetail(auth.client, id);
    if (!detail) {
      return NextResponse.json({ error: "Crop case not found." }, { status: 404 });
    }
    return NextResponse.json({ case: detail });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Could not load the crop case." },
      { status: 500 },
    );
  }
}
