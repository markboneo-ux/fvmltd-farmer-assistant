import "server-only";

import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import { resolveCasePersistenceMode } from "@/lib/cases/persistence";
import {
  redeemPromoCode,
  validatePromoCode,
  type PromoRedeemResult,
} from "./server";
import { logOps } from "@/lib/security/ops-log";

export async function redeemPromoCodeSecure(
  code: string,
  ownerKey: string,
): Promise<PromoRedeemResult> {
  const local = validatePromoCode(code, { ownerKey });
  if (!local.ok) return local;

  if (resolveCasePersistenceMode() === "supabase") {
    const admin = tryCreateAdminClient();
    if (admin.ok) {
      const { data: promo, error: promoError } = await admin.client
        .from("promo_codes")
        .select("id, code, active, start_date, expiry_date, maximum_uses, current_uses, entitlement_granted")
        .eq("code", local.code)
        .maybeSingle();
      if (promoError) {
        logOps("database_failure", { route: "promo-lookup", error: promoError.message });
      } else if (promo) {
        const { data: existing } = await admin.client
          .from("promo_redemptions")
          .select("id")
          .eq("promo_code_id", promo.id)
          .eq("owner_key", ownerKey)
          .maybeSingle();
        if (existing) {
          return {
            ok: false,
            reason: "already_redeemed",
            error: "You have already used this access code.",
          };
        }
        const currentUses = Number(promo.current_uses ?? 0);
        const maximumUses =
          typeof promo.maximum_uses === "number" ? promo.maximum_uses : null;
        if (maximumUses != null && currentUses >= maximumUses) {
          return {
            ok: false,
            reason: "max_uses",
            error: "That access code has already been used up.",
          };
        }
        const { error: redeemError } = await admin.client.from("promo_redemptions").insert({
          promo_code_id: promo.id,
          owner_key: ownerKey,
        });
        if (redeemError) {
          if (/duplicate|unique/i.test(redeemError.message)) {
            return {
              ok: false,
              reason: "already_redeemed",
              error: "You have already used this access code.",
            };
          }
          logOps("database_failure", { route: "promo-redeem", error: redeemError.message });
          return {
            ok: false,
            reason: "invalid",
            error: "I couldn’t complete that right now. Please try again.",
          };
        }
        await admin.client
          .from("promo_codes")
          .update({ current_uses: currentUses + 1 })
          .eq("id", promo.id);
      }
    }
  }

  return redeemPromoCode(code, ownerKey);
}
