import { NextResponse } from "next/server";
import type { RegisteredFarmer } from "@/lib/farmers/types";
import {
  validateFarmerRegistration,
  type FieldErrors,
} from "@/lib/farmers/validation";
import { getMissingSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type RegisterBody = {
  fullName?: unknown;
  whatsappNumber?: unknown;
  country?: unknown;
  countryOther?: unknown;
  district?: unknown;
  farmSize?: unknown;
  farmSizeUnit?: unknown;
  mainCrops?: unknown;
  consent?: unknown;
};

type FarmerRow = {
  id: string;
  farmer_code: string;
  full_name: string;
  phone: string;
  country: string;
  region: string | null;
  farm_size: number | string;
  farm_size_unit: "acres" | "hectares";
  primary_crops: string[] | null;
  member_since: string | null;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function isUniqueViolation(error: {
  code?: string;
  message?: string;
  details?: string;
}): boolean {
  if (error.code === "23505") return true;
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("duplicate") || text.includes("unique");
}

function mapInsertedFarmer(
  inserted: FarmerRow,
  fallbackDistrict: string,
  fallbackCrops: string[],
  fallbackDate: string,
): RegisteredFarmer {
  return {
    id: inserted.id,
    farmerCode: inserted.farmer_code,
    fullName: inserted.full_name,
    whatsappNumber: inserted.phone,
    country: inserted.country,
    district: inserted.region ?? fallbackDistrict,
    farmSize: Number(inserted.farm_size),
    farmSizeUnit: inserted.farm_size_unit,
    mainCrops: inserted.primary_crops ?? fallbackCrops,
    memberSince: inserted.member_since ?? fallbackDate,
  };
}

function duplicatePhoneResponse() {
  return NextResponse.json(
    {
      error: "This WhatsApp number is already registered.",
      errors: {
        whatsappNumber:
          "This WhatsApp number is already registered. Use a different number or open the farmer dashboard if you already signed up.",
      } satisfies FieldErrors,
    },
    { status: 409 },
  );
}

function errorResponse(message: string, status = 500) {
  return NextResponse.json(
    {
      error: message,
      errors: { form: message } satisfies FieldErrors,
    },
    { status },
  );
}

/**
 * Turn Supabase/PostgREST errors into farmer-facing copy.
 * Never mention secret env var names (e.g. service-role keys).
 */
function describeRpcError(error: unknown): string {
  if (!error) return "Could not save your registration. Please try again.";
  if (typeof error === "string" && error.trim()) {
    return sanitizePublicError(error.trim());
  }
  if (typeof error === "object") {
    const record = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    const parts = [record.message, record.details]
      .filter((part): part is string => Boolean(part && String(part).trim()))
      .map((part) => String(part).trim());
    if (parts.length) return sanitizePublicError(parts.join(" — "));
    if (record.code) return `Registration failed (${record.code}).`;
  }
  return "Could not save your registration. Please try again.";
}

function sanitizePublicError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("service_role") ||
    lower.includes("service-role") ||
    lower.includes("supabase_service_role_key")
  ) {
    return "Could not save your registration. Please try again.";
  }
  return message;
}

export async function POST(request: Request) {
  let body: RegisterBody;

  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return errorResponse("Invalid request body.", 400);
  }

  const validation = validateFarmerRegistration({
    fullName: asString(body.fullName),
    whatsappNumber: asString(body.whatsappNumber),
    country: asString(body.country),
    countryOther: asString(body.countryOther),
    district: asString(body.district),
    farmSize: asString(body.farmSize),
    farmSizeUnit: asString(body.farmSizeUnit) as "" | "acres" | "hectares",
    mainCrops: asStringArray(body.mainCrops),
    consent: Boolean(body.consent),
  });

  if (!validation.ok) {
    return NextResponse.json(
      { error: "Please fix the highlighted fields.", errors: validation.errors },
      { status: 400 },
    );
  }

  const data = validation.data;
  const consentAt = new Date().toISOString();

  // Registration uses the low-privilege anon client + register_farmer RPC.
  // Service-role key is intentionally not required.
  const missingPublic = getMissingSupabaseEnv();
  if (missingPublic.length > 0) {
    const safeMissing = missingPublic.filter(
      (name) => !name.toLowerCase().includes("service_role"),
    );
    const label =
      safeMissing.length > 0
        ? safeMissing.join(", ")
        : "public Supabase configuration";
    return errorResponse(
      `Registration is unavailable: missing ${label} on the server.`,
      503,
    );
  }

  try {
    const supabase = await createClient();
    const { data: rows, error } = await supabase.rpc("register_farmer", {
      p_full_name: data.fullName,
      p_phone: data.whatsappNumber,
      p_country: data.country,
      p_district: data.district,
      p_farm_size: data.farmSize,
      p_farm_size_unit: data.farmSizeUnit,
      p_main_crops: data.mainCrops,
      p_consent: true,
    });

    if (error) {
      const message = describeRpcError(error).toLowerCase();
      if (isUniqueViolation(error) || message.includes("already registered")) {
        return duplicatePhoneResponse();
      }

      console.error("Farmer registration (RPC) failed:", error);
      return errorResponse(describeRpcError(error), 500);
    }

    const inserted = (Array.isArray(rows) ? rows[0] : rows) as
      | FarmerRow
      | undefined;
    if (!inserted) {
      return errorResponse(
        "Registration succeeded but no farmer record was returned.",
        500,
      );
    }

    return NextResponse.json(
      {
        farmer: mapInsertedFarmer(
          inserted,
          data.district,
          data.mainCrops,
          consentAt.slice(0, 10),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Farmer registration crashed:", error);
    return errorResponse(describeRpcError(error), 500);
  }
}
