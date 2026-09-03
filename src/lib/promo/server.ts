/**
 * Server-side promotional code validation.
 * The beta code is never treated as a client-side secret.
 */

export type PromoEntitlement = "promo" | "trial" | "paid";

export type PromoCodeRecord = {
  id: string;
  code: string;
  active: boolean;
  startDate: string | null;
  expiryDate: string | null;
  maximumUses: number | null;
  currentUses: number;
  entitlementGranted: PromoEntitlement;
  createdAt: string;
  createdBy: string | null;
};

export type PromoRedeemResult =
  | { ok: true; entitlement: PromoEntitlement; code: string }
  | {
      ok: false;
      reason:
        | "invalid"
        | "inactive"
        | "not_started"
        | "expired"
        | "max_uses"
        | "already_redeemed"
        | "rate_limited";
      error: string;
    };

const CONTROLLED_BETA_CODE = "FVM";

const codes = new Map<string, PromoCodeRecord>();
const redemptions = new Map<string, Set<string>>();

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function resetPromoStore() {
  codes.clear();
  redemptions.clear();
  seedControlledBetaPromo();
}

export function seedControlledBetaPromo(now = new Date()) {
  const existing = codes.get(CONTROLLED_BETA_CODE);
  if (existing) return existing;
  const record: PromoCodeRecord = {
    id: "promo_fvm_controlled_beta",
    code: CONTROLLED_BETA_CODE,
    active: true,
    startDate: "2026-01-01T00:00:00.000Z",
    expiryDate: "2027-12-31T23:59:59.000Z",
    maximumUses: 500,
    currentUses: 0,
    entitlementGranted: "promo",
    createdAt: now.toISOString(),
    createdBy: "fvmltd",
  };
  codes.set(CONTROLLED_BETA_CODE, record);
  return record;
}

export function upsertPromoCode(record: PromoCodeRecord) {
  codes.set(normalizeCode(record.code), {
    ...record,
    code: normalizeCode(record.code),
  });
}

export function getPromoCode(code: string): PromoCodeRecord | null {
  return codes.get(normalizeCode(code)) ?? null;
}

export function validatePromoCode(
  code: string,
  options?: { now?: Date; ownerKey?: string | null },
): PromoRedeemResult {
  seedControlledBetaPromo();
  const normalized = normalizeCode(code);
  if (!normalized) {
    return { ok: false, reason: "invalid", error: "Enter a promotional code." };
  }

  const record = codes.get(normalized);
  if (!record) {
    return { ok: false, reason: "invalid", error: "That promotional code is not valid." };
  }
  if (!record.active) {
    return { ok: false, reason: "inactive", error: "That promotional code is no longer active." };
  }

  const now = options?.now ?? new Date();
  if (record.startDate && now < new Date(record.startDate)) {
    return { ok: false, reason: "not_started", error: "That promotional code is not active yet." };
  }
  if (record.expiryDate && now > new Date(record.expiryDate)) {
    return { ok: false, reason: "expired", error: "That promotional code has expired." };
  }
  if (record.maximumUses != null && record.currentUses >= record.maximumUses) {
    return { ok: false, reason: "max_uses", error: "That promotional code has already been used up." };
  }

  const owner = options?.ownerKey;
  if (owner && redemptions.get(normalized)?.has(owner)) {
    return { ok: false, reason: "already_redeemed", error: "You have already used this promotional code." };
  }

  return { ok: true, entitlement: record.entitlementGranted, code: normalized };
}

export function redeemPromoCode(
  code: string,
  ownerKey: string,
  options?: { now?: Date },
): PromoRedeemResult {
  const validated = validatePromoCode(code, { now: options?.now, ownerKey });
  if (!validated.ok) return validated;

  const record = codes.get(validated.code);
  if (!record) {
    return { ok: false, reason: "invalid", error: "That promotional code is not valid." };
  }
  record.currentUses += 1;
  codes.set(validated.code, record);
  const owners = redemptions.get(validated.code) ?? new Set<string>();
  owners.add(ownerKey);
  redemptions.set(validated.code, owners);
  return validated;
}

export function listPromoCodes(): PromoCodeRecord[] {
  seedControlledBetaPromo();
  return [...codes.values()];
}

export const CONTROLLED_BETA_PROMO_CODE = CONTROLLED_BETA_CODE;
