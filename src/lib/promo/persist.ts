import "server-only";

import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import {
  getPromoCode,
  redeemPromoCode,
  upsertPromoCode,
  type PromoCodeRecord,
  type PromoRedeemResult,
} from "./server";

function asInt(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rowToPromo(row: Record<string, unknown>): PromoCodeRecord {
  const entitlement =
    row.entitlement_granted === "paid" ||
    row.entitlement_granted === "trial" ||
    row.entitlement_granted === "promo" ||
    row.entitlement_granted === "fvm_beta"
      ? row.entitlement_granted
      : "fvm_beta";
  return {
    id: String(row.id ?? ""),
    code: String(row.code ?? "").toUpperCase(),
    active: row.active !== false,
    startDate: typeof row.start_date === "string" ? row.start_date : null,
    expiryDate: typeof row.expiry_date === "string" ? row.expiry_date : null,
    maximumUses: asInt(row.maximum_uses),
    currentUses: asInt(row.current_uses) ?? 0,
    entitlementGranted: entitlement,
    messagesAllowance: asInt(row.messages_allowance),
    casesAllowance: asInt(row.cases_allowance),
    imageAnalysesAllowance: asInt(row.image_analyses_allowance),
    voiceMessagesAllowance: asInt(row.voice_messages_allowance),
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    createdBy: typeof row.created_by === "string" ? row.created_by : null,
  };
}

export async function hydratePromoCodesFromDb(): Promise<void> {
  const admin = tryCreateAdminClient();
  if (!admin.ok) return;
  try {
    const { data, error } = await admin.client.from("promo_codes").select("*");
    if (error || !Array.isArray(data)) return;
    for (const row of data as Record<string, unknown>[]) {
      upsertPromoCode(rowToPromo(row));
    }
  } catch {
    // Memory seed still applies.
  }
}

export async function persistPromoRedemption(options: {
  code: string;
  ownerKey: string;
}): Promise<void> {
  const admin = tryCreateAdminClient();
  if (!admin.ok) return;
  const record = getPromoCode(options.code);
  if (!record) return;
  try {
    await admin.client.from("promo_codes").update({
      current_uses: record.currentUses,
    }).eq("id", record.id);
    await admin.client.from("promo_redemptions").insert({
      promo_code_id: record.id,
      owner_key: options.ownerKey,
    });
  } catch {
    // Unique violation is treated as already redeemed on the next attempt via memory.
  }
}

export async function redeemPromoForOwner(
  code: string,
  ownerKey: string,
): Promise<PromoRedeemResult> {
  await hydratePromoCodesFromDb();
  const admin = tryCreateAdminClient();
  if (admin.ok) {
    try {
      const record = getPromoCode(code);
      if (record) {
        const { data } = await admin.client
          .from("promo_redemptions")
          .select("id")
          .eq("promo_code_id", record.id)
          .eq("owner_key", ownerKey)
          .maybeSingle();
        if (data) {
          return {
            ok: false,
            reason: "already_redeemed",
            error: "You have already used this promotional code.",
          };
        }
      }
    } catch {
      // Fall through to memory redeem.
    }
  }

  const result = redeemPromoCode(code, ownerKey);
  if (result.ok) {
    await persistPromoRedemption({ code: result.code, ownerKey });
  }
  return result;
}
