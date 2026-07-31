import { NextResponse } from "next/server";
import { requireStaffApi } from "@/lib/staff/auth";
import { listStaffQueueCases } from "@/lib/staff/cases";
import type { StaffCaseFilter } from "@/lib/staff/types";

export const runtime = "nodejs";

const FILTERS: StaffCaseFilter[] = ["new", "urgent", "in_review", "all"];

function parseFilter(value: string | null): StaffCaseFilter {
  if (value && FILTERS.includes(value as StaffCaseFilter)) {
    return value as StaffCaseFilter;
  }
  return "in_review";
}

export async function GET(request: Request) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const filter = parseFilter(
    new URL(request.url).searchParams.get("filter"),
  );

  try {
    const { cases, stats } = await listStaffQueueCases(auth.client, filter);
    return NextResponse.json({ cases, stats, filter });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Could not load the staff review queue." },
      { status: 500 },
    );
  }
}
