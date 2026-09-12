import { NextResponse } from "next/server";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import {
  ensureFarmerProfileForUser,
  updateFarmerAccountProfile,
  type FarmerType,
} from "@/lib/auth/complete-farmer-auth";
import { farmerFacingError } from "@/lib/beta/farmer-error";
import { COUNTRY_OPTIONS } from "@/data/countries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FARMER_TYPES: FarmerType[] = [
  "home_gardener",
  "small_farmer",
  "commercial_farmer",
  "agronomist",
  "extension_officer",
];

export async function GET() {
  const identity = await resolveIdentityFromRequest();
  if (!identity.authUserId) {
    return NextResponse.json({ error: "Log in to view your profile." }, { status: 401 });
  }
  const profile = await ensureFarmerProfileForUser({
    authUserId: identity.authUserId,
    email: identity.email,
  });
  if (!profile) {
    return NextResponse.json(
      {
        error: farmerFacingError("I couldn’t load your profile. Please try again."),
        email: identity.email,
      },
      { status: 503 },
    );
  }
  return NextResponse.json({
    profile,
    countries: COUNTRY_OPTIONS,
    farmerTypes: [
      { id: "home_gardener", label: "Home gardener" },
      { id: "small_farmer", label: "Small farmer" },
      { id: "commercial_farmer", label: "Commercial farmer" },
      { id: "agronomist", label: "Agronomist" },
      { id: "extension_officer", label: "Extension officer" },
    ],
  });
}

export async function PATCH(request: Request) {
  const identity = await resolveIdentityFromRequest();
  if (!identity.authUserId) {
    return NextResponse.json({ error: "Log in to update your profile." }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "I couldn’t save that. Please try again." }, { status: 400 });
  }

  const farmerType =
    typeof body.farmerType === "string" && FARMER_TYPES.includes(body.farmerType as FarmerType)
      ? (body.farmerType as FarmerType)
      : body.farmerType === null
        ? null
        : undefined;

  const farmSize =
    typeof body.farmSize === "number"
      ? body.farmSize
      : typeof body.farmSize === "string" && body.farmSize.trim()
        ? Number(body.farmSize)
        : body.farmSize === null
          ? null
          : undefined;

  const profile = await updateFarmerAccountProfile(identity.authUserId, {
    fullName: typeof body.fullName === "string" ? body.fullName : undefined,
    country: typeof body.country === "string" ? body.country : body.country === null ? null : undefined,
    district: typeof body.district === "string" ? body.district : body.district === null ? null : undefined,
    farmerType,
    primaryCrops: Array.isArray(body.primaryCrops)
      ? body.primaryCrops.filter((item): item is string => typeof item === "string")
      : typeof body.primaryCrops === "string"
        ? body.primaryCrops.split(",").map((item) => item.trim()).filter(Boolean)
        : undefined,
    farmSize: Number.isFinite(farmSize as number) || farmSize === null ? farmSize : undefined,
    farmSizeUnit: typeof body.farmSizeUnit === "string" ? body.farmSizeUnit : undefined,
  });

  if (!profile) {
    return NextResponse.json(
      { error: farmerFacingError("I couldn’t save your profile. Please try again.") },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, profile });
}
