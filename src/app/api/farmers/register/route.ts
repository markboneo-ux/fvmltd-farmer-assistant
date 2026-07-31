import { NextResponse } from "next/server";
import { generateFarmerCode } from "@/lib/farmers/id";
import type { RegisteredFarmer } from "@/lib/farmers/types";
import {
  validateFarmerRegistration,
  type FieldErrors,
} from "@/lib/farmers/validation";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RegisterBody = {
  fullName?: unknown;
  whatsappNumber?: unknown;
  country?: unknown;
  district?: unknown;
  farmSize?: unknown;
  farmSizeUnit?: unknown;
  mainCrops?: unknown;
  consent?: unknown;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return error.code === "23505";
}

export async function POST(request: Request) {
  let body: RegisterBody;

  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body.", errors: { form: "Invalid request body." } },
      { status: 400 },
    );
  }

  const validation = validateFarmerRegistration({
    fullName: asString(body.fullName),
    whatsappNumber: asString(body.whatsappNumber),
    country: asString(body.country),
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

  let supabase;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json(
      {
        error:
          "Registration is unavailable: Supabase is not configured on the server.",
        errors: {
          form: "Registration is unavailable right now. Please try again later.",
        } satisfies FieldErrors,
      },
      { status: 503 },
    );
  }

  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const farmerCode = generateFarmerCode();

    const { data: inserted, error } = await supabase
      .from("farmers")
      .insert({
        farmer_code: farmerCode,
        full_name: data.fullName,
        phone: data.whatsappNumber,
        country: data.country,
        region: data.district,
        farm_size: data.farmSize,
        farm_size_unit: data.farmSizeUnit,
        main_crops: data.mainCrops,
        consent_store_data: true,
        consent_at: consentAt,
        member_since: new Date().toISOString().slice(0, 10),
      })
      .select(
        "id, farmer_code, full_name, phone, country, region, farm_size, farm_size_unit, main_crops, member_since",
      )
      .single();

    if (!error && inserted) {
      const farmer: RegisteredFarmer = {
        id: inserted.id as string,
        farmerCode: inserted.farmer_code as string,
        fullName: inserted.full_name as string,
        whatsappNumber: inserted.phone as string,
        country: inserted.country as string,
        district: (inserted.region as string) ?? data.district,
        farmSize: Number(inserted.farm_size),
        farmSizeUnit: inserted.farm_size_unit as "acres" | "hectares",
        mainCrops: (inserted.main_crops as string[]) ?? data.mainCrops,
        memberSince: (inserted.member_since as string) ?? consentAt.slice(0, 10),
      };

      return NextResponse.json({ farmer }, { status: 201 });
    }

    if (error && isUniqueViolation(error)) {
      const message = error.message ?? "";
      if (message.includes("phone") || message.includes("farmers_phone")) {
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

      // farmer_code collision — retry with a new code
      if (message.includes("farmer_code") && attempt < maxAttempts - 1) {
        continue;
      }
    }

    console.error("Farmer registration failed:", error);
    return NextResponse.json(
      {
        error: "Could not save your registration. Please try again.",
        errors: {
          form: "Could not save your registration. Please try again.",
        } satisfies FieldErrors,
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      error: "Could not generate a unique Farmer ID. Please try again.",
      errors: {
        form: "Could not generate a unique Farmer ID. Please try again.",
      } satisfies FieldErrors,
    },
    { status: 500 },
  );
}
