import { NextResponse } from "next/server";
import { generateFarmerCode } from "@/lib/farmers/id";
import type { RegisteredFarmer } from "@/lib/farmers/types";
import {
  validateFarmerRegistration,
  type FieldErrors,
} from "@/lib/farmers/validation";
import { createAdminClient } from "@/lib/supabase/admin";
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

function isUniqueViolation(error: { code?: string; message?: string; details?: string }): boolean {
  if (error.code === "23505") return true;
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("duplicate") || text.includes("unique");
}

function isMissingRpc(error: { code?: string; message?: string }): boolean {
  if (error.code === "PGRST202") return true;
  const message = (error.message ?? "").toLowerCase();
  return (
    message.includes("register_farmer") &&
    (message.includes("could not find") ||
      message.includes("does not exist") ||
      message.includes("schema cache"))
  );
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

function describeUnknownError(error: unknown): string {
  if (!error) return "Could not save your registration. Please try again.";
  if (typeof error === "string" && error.trim()) return error.trim();
  if (typeof error === "object") {
    const record = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    const parts = [record.message, record.details, record.hint]
      .filter((part): part is string => Boolean(part && String(part).trim()))
      .map((part) => String(part).trim());
    if (parts.length) return parts.join(" — ");
    if (record.code) return `Registration failed (${record.code}).`;
  }
  return "Could not save your registration. Please try again.";
}

async function insertWithAdmin(
  data: {
    fullName: string;
    whatsappNumber: string;
    country: string;
    district: string;
    farmSize: number;
    farmSizeUnit: "acres" | "hectares";
    mainCrops: string[];
  },
  consentAt: string,
): Promise<
  | { ok: true; farmer: RegisteredFarmer }
  | { ok: false; response: NextResponse }
> {
  let supabase;
  try {
    supabase = createAdminClient();
  } catch (error) {
    const missing = getMissingSupabaseEnv({ requireServiceRole: true });
    const message =
      missing.length > 0
        ? `Registration is unavailable: missing ${missing.join(", ")} on the server.`
        : describeUnknownError(error);
    return { ok: false, response: errorResponse(message, 503) };
  }

  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const farmerCode = generateFarmerCode();

    const { data: inserted, error } = await supabase
      .from("farmer_profiles")
      .insert({
        farmer_code: farmerCode,
        full_name: data.fullName,
        phone: data.whatsappNumber,
        country: data.country,
        region: data.district,
        district: data.district,
        farm_size: data.farmSize,
        farm_size_unit: data.farmSizeUnit,
        primary_crops: data.mainCrops,
        consent_store_data: true,
        consent_at: consentAt,
        member_since: consentAt.slice(0, 10),
        is_active: true,
      })
      .select(
        "id, farmer_code, full_name, phone, country, region, farm_size, farm_size_unit, primary_crops, member_since",
      )
      .single();

    if (!error && inserted) {
      return {
        ok: true,
        farmer: mapInsertedFarmer(
          inserted as FarmerRow,
          data.district,
          data.mainCrops,
          consentAt.slice(0, 10),
        ),
      };
    }

    if (error && isUniqueViolation(error)) {
      const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
      if (text.includes("phone")) {
        return { ok: false, response: duplicatePhoneResponse() };
      }
      if (text.includes("farmer_code") && attempt < maxAttempts - 1) {
        continue;
      }
    }

    console.error("Farmer registration (admin) failed:", error);
    return {
      ok: false,
      response: errorResponse(describeUnknownError(error), 500),
    };
  }

  return {
    ok: false,
    response: errorResponse(
      "Could not generate a unique Farmer ID. Please try again.",
      500,
    ),
  };
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

  const missingPublic = getMissingSupabaseEnv();
  if (missingPublic.length > 0) {
    return errorResponse(
      `Registration is unavailable: missing ${missingPublic.join(", ")} on the server.`,
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
      p_primary_crops: data.mainCrops,
      p_consent: true,
    });

    if (!error) {
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
    }

    const message = describeUnknownError(error).toLowerCase();
    if (
      isUniqueViolation(error) ||
      message.includes("already registered")
    ) {
      return duplicatePhoneResponse();
    }

    if (isMissingRpc(error)) {
      // Migration not applied yet — fall back to service-role insert.
      const fallback = await insertWithAdmin(data, consentAt);
      if (fallback.ok) {
        return NextResponse.json({ farmer: fallback.farmer }, { status: 201 });
      }
      return fallback.response;
    }

    console.error("Farmer registration (RPC) failed:", error);
    return errorResponse(describeUnknownError(error), 500);
  } catch (error) {
    console.error("Farmer registration crashed:", error);
    return errorResponse(describeUnknownError(error), 500);
  }
}
