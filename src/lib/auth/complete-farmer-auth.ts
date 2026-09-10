import "server-only";

import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import { isTestRuntime, resolveCasePersistenceMode } from "@/lib/cases/persistence";
import { getEntitlement, grantEntitlement, type EntitlementRecord } from "@/lib/beta/entitlements";
import { linkGuestCasesToUser } from "@/lib/cases/store";
import { logOps } from "@/lib/security/ops-log";

const FARMER_TYPES = [
  "home_gardener",
  "small_farmer",
  "commercial_farmer",
  "agronomist",
  "extension_officer",
] as const;

export type FarmerType = (typeof FARMER_TYPES)[number];

export type FarmerAccountProfile = {
  id: string;
  authUserId: string;
  fullName: string;
  email: string | null;
  country: string | null;
  district: string | null;
  farmerType: FarmerType | null;
  primaryCrops: string[];
  farmSize: number | null;
  farmSizeUnit: string | null;
  avatarStoragePath: string | null;
  avatarUrl: string | null;
};

function asTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function asFarmerType(value: unknown): FarmerType | null {
  if (typeof value !== "string") return null;
  return (FARMER_TYPES as readonly string[]).includes(value) ? (value as FarmerType) : null;
}

function cropsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function displayNameFromEmail(email: string | null | undefined): string {
  const local = email?.split("@")[0]?.trim() || "Farmer";
  const spaced = local.replace(/[._-]+/g, " ").trim();
  if (!spaced) return "Farmer";
  return spaced.replace(/\b\w/g, (char) => char.toUpperCase());
}

function mapProfile(
  row: Record<string, unknown>,
  avatarUrl: string | null,
): FarmerAccountProfile {
  return {
    id: String(row.id ?? ""),
    authUserId: String(row.auth_user_id ?? ""),
    fullName: asTrimmed(row.full_name) || displayNameFromEmail(asTrimmed(row.email)),
    email: asTrimmed(row.email),
    country: asTrimmed(row.country),
    district: asTrimmed(row.district) || asTrimmed(row.region),
    farmerType: asFarmerType(row.farmer_type),
    primaryCrops: cropsFrom(row.primary_crops),
    farmSize: typeof row.farm_size === "number" ? row.farm_size : null,
    farmSizeUnit: asTrimmed(row.farm_size_unit),
    avatarStoragePath: asTrimmed(row.avatar_storage_path),
    avatarUrl,
  };
}

async function signedAvatarUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const admin = tryCreateAdminClient();
  if (!admin.ok) return null;
  const { data, error } = await admin.client.storage
    .from("farmer-avatars")
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export function farmerInitials(name: string | null | undefined, email?: string | null): string {
  const source = (name || email || "F").trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const letters = (parts[0]?.[0] ?? "F") + (parts[1]?.[0] ?? "");
  return letters.toUpperCase();
}

export async function ensureFarmerProfileForUser(options: {
  authUserId: string;
  email?: string | null;
  fullName?: string | null;
  avatarUrlHint?: string | null;
}): Promise<FarmerAccountProfile | null> {
  const admin = tryCreateAdminClient();
  if (!admin.ok) return null;

  const { data: existing } = await admin.client
    .from("farmer_profiles")
    .select(
      "id, auth_user_id, full_name, email, country, region, district, farmer_type, primary_crops, farm_size, farm_size_unit, avatar_storage_path",
    )
    .eq("auth_user_id", options.authUserId)
    .maybeSingle();

  if (existing) {
    const row = existing as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (!asTrimmed(row.email) && options.email) updates.email = options.email;
    if ((!asTrimmed(row.full_name) || asTrimmed(row.full_name) === "Farmer") && options.fullName) {
      updates.full_name = options.fullName;
    }
    if (Object.keys(updates).length > 0) {
      await admin.client.from("farmer_profiles").update(updates).eq("id", row.id);
    }
    return mapProfile({ ...row, ...updates }, await signedAvatarUrl(asTrimmed(row.avatar_storage_path)));
  }

  const fullName = asTrimmed(options.fullName) || displayNameFromEmail(options.email);
  const insert = {
    auth_user_id: options.authUserId,
    full_name: fullName,
    email: options.email ?? null,
    country: null,
    district: null,
    primary_crops: [] as string[],
    consent_store_data: true,
    consent_at: new Date().toISOString(),
  };

  const { data, error } = await admin.client
    .from("farmer_profiles")
    .insert(insert)
    .select(
      "id, auth_user_id, full_name, email, country, region, district, farmer_type, primary_crops, farm_size, farm_size_unit, avatar_storage_path",
    )
    .maybeSingle();

  if (error || !data) {
    logOps("database_failure", { route: "farmer-profile-create", error: error?.message ?? "insert failed" });
    return null;
  }

  return mapProfile(data as Record<string, unknown>, null);
}

export async function loadFarmerAccountProfile(
  authUserId: string,
): Promise<FarmerAccountProfile | null> {
  const admin = tryCreateAdminClient();
  if (!admin.ok) return null;
  const { data, error } = await admin.client
    .from("farmer_profiles")
    .select(
      "id, auth_user_id, full_name, email, country, region, district, farmer_type, primary_crops, farm_size, farm_size_unit, avatar_storage_path",
    )
    .eq("auth_user_id", authUserId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return mapProfile(row, await signedAvatarUrl(asTrimmed(row.avatar_storage_path)));
}

export async function updateFarmerAccountProfile(
  authUserId: string,
  patch: {
    fullName?: string | null;
    country?: string | null;
    district?: string | null;
    farmerType?: FarmerType | null;
    primaryCrops?: string[] | null;
    farmSize?: number | null;
    farmSizeUnit?: string | null;
  },
): Promise<FarmerAccountProfile | null> {
  const current = await loadFarmerAccountProfile(authUserId);
  if (!current) {
    await ensureFarmerProfileForUser({ authUserId });
  }
  const admin = tryCreateAdminClient();
  if (!admin.ok) return null;

  const updates: Record<string, unknown> = {};
  if (patch.fullName !== undefined) updates.full_name = asTrimmed(patch.fullName);
  if (patch.country !== undefined) updates.country = asTrimmed(patch.country);
  if (patch.district !== undefined) {
    updates.district = asTrimmed(patch.district);
    updates.region = asTrimmed(patch.district);
  }
  if (patch.farmerType !== undefined) updates.farmer_type = patch.farmerType;
  if (patch.primaryCrops !== undefined) {
    updates.primary_crops = (patch.primaryCrops ?? [])
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (patch.farmSize !== undefined) updates.farm_size = patch.farmSize;
  if (patch.farmSizeUnit !== undefined) updates.farm_size_unit = asTrimmed(patch.farmSizeUnit);

  const { error } = await admin.client
    .from("farmer_profiles")
    .update(updates)
    .eq("auth_user_id", authUserId);
  if (error) {
    logOps("database_failure", { route: "farmer-profile-update", error: error.message });
    return null;
  }
  return loadFarmerAccountProfile(authUserId);
}

export async function saveFarmerAvatar(options: {
  authUserId: string;
  bytes: Buffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
}): Promise<FarmerAccountProfile | null> {
  const admin = tryCreateAdminClient();
  if (!admin.ok) return null;
  await ensureFarmerProfileForUser({ authUserId: options.authUserId });
  const ext = options.contentType === "image/png" ? "png" : options.contentType === "image/webp" ? "webp" : "jpg";
  const path = `${options.authUserId}/avatar.${ext}`;
  const { error } = await admin.client.storage.from("farmer-avatars").upload(path, options.bytes, {
    contentType: options.contentType,
    upsert: true,
  });
  if (error) {
    logOps("database_failure", { route: "farmer-avatar-upload", error: error.message });
    return null;
  }
  await admin.client
    .from("farmer_profiles")
    .update({ avatar_storage_path: path })
    .eq("auth_user_id", options.authUserId);
  return loadFarmerAccountProfile(options.authUserId);
}

export async function linkGuestSessionToUser(
  guestSessionId: string | null | undefined,
  authUserId: string,
): Promise<number> {
  if (!guestSessionId) return 0;
  const linkedCases = await linkGuestCasesToUser(guestSessionId, authUserId);
  if (resolveCasePersistenceMode() !== "supabase") return linkedCases;
  const admin = tryCreateAdminClient();
  if (!admin.ok) return linkedCases;
  await admin.client.from("guest_sessions").upsert(
    {
      id: guestSessionId,
      linked_auth_user_id: authUserId,
      last_seen_at: new Date().toISOString(),
      last_linked_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  return linkedCases;
}

export async function persistEntitlementRecord(record: EntitlementRecord): Promise<void> {
  if (isTestRuntime()) return;
  if (resolveCasePersistenceMode() !== "supabase") return;
  const admin = tryCreateAdminClient();
  if (!admin.ok) return;
  const authUserId = record.ownerKey.startsWith("user:")
    ? record.ownerKey.slice(5)
    : null;
  const guestSessionId = record.ownerKey.startsWith("guest:")
    ? record.ownerKey.slice(6)
    : null;
  const { error } = await admin.client.from("user_entitlements").upsert(
    {
      owner_key: record.ownerKey,
      auth_user_id: authUserId,
      guest_session_id: guestSessionId,
      access_state: record.access,
      source: record.source,
      granted_at: record.grantedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_key" },
  );
  if (error) {
    logOps("database_failure", { route: "entitlement-persist", error: error.message });
  }
}

export async function hydrateEntitlementsFromDb(options: {
  authUserId?: string | null;
  guestSessionId?: string | null;
}): Promise<void> {
  if (isTestRuntime()) return;
  if (resolveCasePersistenceMode() !== "supabase") return;
  const admin = tryCreateAdminClient();
  if (!admin.ok) return;
  const keys = [
    options.authUserId ? `user:${options.authUserId}` : null,
    options.guestSessionId ? `guest:${options.guestSessionId}` : null,
  ].filter((item): item is string => Boolean(item));
  if (keys.length === 0) return;
  const { data, error } = await admin.client
    .from("user_entitlements")
    .select("owner_key, access_state, source, granted_at")
    .in("owner_key", keys);
  if (error || !data) return;
  for (const row of data as Array<{
    owner_key: string;
    access_state: EntitlementRecord["access"];
    source: EntitlementRecord["source"];
    granted_at: string;
  }>) {
    grantEntitlement(row.owner_key, row.access_state, row.source);
  }
}

/**
 * After a successful login/signup/OTP/OAuth, create entitlement, profile,
 * and attach guest crop history.
 */
export async function completeFarmerAuthentication(options: {
  authUserId: string;
  email?: string | null;
  fullName?: string | null;
  guestSessionId?: string | null;
}): Promise<{ linkedGuestCases: number; profileId: string | null }> {
  const userKey = `user:${options.authUserId}`;
  const existing = getEntitlement(userKey);
  if (!existing || (existing.access !== "promo" && existing.access !== "paid" && existing.access !== "trial")) {
    const record = grantEntitlement(userKey, "free_registered", "signup");
    void persistEntitlementRecord(record);
  }
  if (options.guestSessionId) {
    const guestKey = `guest:${options.guestSessionId}`;
    const guestExisting = getEntitlement(guestKey);
    if (
      !guestExisting ||
      (guestExisting.access !== "promo" &&
        guestExisting.access !== "paid" &&
        guestExisting.access !== "trial")
    ) {
      const guestRecord = grantEntitlement(guestKey, "free_registered", "signup");
      void persistEntitlementRecord(guestRecord);
    }
  }
  const linkedGuestCases = await linkGuestSessionToUser(
    options.guestSessionId,
    options.authUserId,
  );
  const profile = await ensureFarmerProfileForUser({
    authUserId: options.authUserId,
    email: options.email,
    fullName: options.fullName,
  });
  return { linkedGuestCases, profileId: profile?.id ?? null };
}

export async function maybeStoreFarmerContextHints(options: {
  farmerProfileId?: string | null;
  authUserId?: string | null;
  country?: string | null;
  district?: string | null;
  crops?: string[];
  farmSizeText?: string | null;
}): Promise<void> {
  if (isTestRuntime()) return;
  if (!options.authUserId && !options.farmerProfileId) return;
  const current = options.authUserId
    ? await loadFarmerAccountProfile(options.authUserId)
    : null;
  if (!current && !options.authUserId) return;
  const patch: Parameters<typeof updateFarmerAccountProfile>[1] = {};
  if (!current?.country && options.country) patch.country = options.country;
  if (!current?.district && options.district) patch.district = options.district;
  if (options.crops && options.crops.length > 0) {
    const merged = [...new Set([...(current?.primaryCrops ?? []), ...options.crops])];
    if (merged.join("|") !== (current?.primaryCrops ?? []).join("|")) {
      patch.primaryCrops = merged;
    }
  }
  const acres = options.farmSizeText?.match(/(\d+(?:\.\d+)?)\s*(acre|hectares?|ha)\b/i);
  if (!current?.farmSize && acres) {
    patch.farmSize = Number(acres[1]);
    patch.farmSizeUnit = /ha|hectare/i.test(acres[2]) ? "hectares" : "acres";
  }
  if (Object.keys(patch).length === 0 || !options.authUserId) return;
  await updateFarmerAccountProfile(options.authUserId, patch);
}
