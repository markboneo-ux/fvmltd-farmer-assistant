import { NextResponse } from "next/server";
import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import { getSupabasePublicEnv, getSupabaseServiceRoleKey } from "@/lib/supabase/env";
import { probeStaffPreview } from "@/lib/staff/preview-diagnostics";
import { probeDashboardTables } from "@/lib/admin/dashboard-tables";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const vercelEnv = process.env.VERCEL_ENV ?? null;
  if (vercelEnv !== "preview" && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (request.headers.get("x-fvm-debug") !== "1") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const admin = tryCreateAdminClient();
  if (!admin.ok) {
    return NextResponse.json(
      {
        error: admin.error,
        vercelEnv,
      },
      { status: 503 },
    );
  }

  try {
    const { url } = getSupabasePublicEnv();
    const diagnostics = await probeStaffPreview({
      supabaseUrl: url,
      serviceRoleKey: getSupabaseServiceRoleKey(),
      client: admin.client as never,
    });
    const dashboardTables = await probeDashboardTables(admin.client as never);
    return NextResponse.json({ ...diagnostics, dashboardTables });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "diagnostics failed",
        vercelEnv,
      },
      { status: 503 },
    );
  }
}
