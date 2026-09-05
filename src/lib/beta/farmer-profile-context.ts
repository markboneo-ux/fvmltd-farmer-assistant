import { tryCreateAdminClient } from "@/lib/supabase/helpers";

export type RegisteredFarmerContext = {
  country: string | null;
  district: string | null;
  primaryCrops: string[];
};

function asTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * Country/region already stored on a registered farmer profile.
 * Guests have no profile id, so this returns null and never assumes Trinidad.
 */
export async function loadRegisteredFarmerContext(
  farmerProfileId: string | null | undefined,
): Promise<RegisteredFarmerContext | null> {
  if (!farmerProfileId?.trim()) return null;

  const admin = tryCreateAdminClient();
  if (!admin.ok) return null;

  const { data, error } = await admin.client
    .from("farmer_profiles")
    .select("country, region, district, primary_crops")
    .eq("id", farmerProfileId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as {
    country?: string | null;
    region?: string | null;
    district?: string | null;
    primary_crops?: unknown;
  };

  const primaryCrops = Array.isArray(row.primary_crops)
    ? row.primary_crops.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  return {
    country: asTrimmed(row.country),
    district: asTrimmed(row.district) || asTrimmed(row.region),
    primaryCrops,
  };
}
