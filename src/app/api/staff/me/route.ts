import { NextResponse } from "next/server";
import { getStaffSession } from "@/lib/staff/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await getStaffSession();
  if (!session.ok) {
    return NextResponse.json(
      { error: session.error },
      { status: session.status },
    );
  }

  return NextResponse.json({ staff: session.staff });
}
