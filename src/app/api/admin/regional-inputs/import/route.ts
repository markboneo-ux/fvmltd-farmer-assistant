import { connection } from "next/server";
import { NextResponse } from "next/server";
import {
  importRegionalInputsCsv,
  type ImportSourceType,
} from "@/lib/regional-inputs/import-csv";
import { getStaffSession } from "@/lib/staff/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE_TYPES: ImportSourceType[] = [
  "official_authority",
  "fvmltd_inventory",
  "approved_distributor",
  "fertilizer_supplier",
  "biological_control_supplier",
  "other",
];

function isSourceType(value: string): value is ImportSourceType {
  return (SOURCE_TYPES as string[]).includes(value);
}

/**
 * Secure administrator CSV import for the regional agri-input catalogue.
 * Requires an active staff session. Does not invent products — imports only.
 *
 * Supported CSV sources:
 * - official national pesticide-registration authorities
 * - FVMLTD inventory
 * - approved distributors
 * - fertilizer suppliers
 * - biological-control suppliers
 */
export async function POST(request: Request) {
  await connection();

  const staff = await getStaffSession();
  if (!staff.ok) {
    return NextResponse.json(
      { error: staff.error || "Staff authentication required." },
      { status: staff.status },
    );
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Send a multipart form with a CSV file field named file." },
      { status: 400 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  const sourceTypeRaw = String(form.get("sourceType") || "other");
  const verifiedBy =
    String(form.get("verifiedBy") || staff.staff.email || "staff").trim() ||
    "staff";

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "Choose a CSV file to import." },
      { status: 400 },
    );
  }

  if (
    !file.name.toLowerCase().endsWith(".csv") &&
    file.type &&
    !file.type.includes("csv") &&
    !file.type.includes("text")
  ) {
    return NextResponse.json(
      { error: "Only CSV files are accepted." },
      { status: 400 },
    );
  }

  if (!isSourceType(sourceTypeRaw)) {
    return NextResponse.json(
      {
        error: `sourceType must be one of: ${SOURCE_TYPES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const csvText = await file.text();
  const result = importRegionalInputsCsv(csvText, {
    sourceType: sourceTypeRaw,
    verifiedBy,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    rowsRead: result.rowsRead,
    rowsImported: result.rowsImported,
    sourceType: result.sourceType,
    warnings: result.warnings,
    note: "Import applied to the runtime catalogue. Persist via Supabase migrations/seed jobs for production durability. Do not push migrations directly to production from this agent.",
  });
}
