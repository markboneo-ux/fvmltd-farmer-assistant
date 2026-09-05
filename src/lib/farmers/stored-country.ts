import { resolveStoredCountry } from "@/data/countries";

/**
 * Persist only an explicitly selected country.
 * A new farmer with no country stays unknown — never Trinidad by default.
 */
export function storedCountryForNewFarmer(
  selected: string | null | undefined,
  countryOther = "",
): string | null {
  const resolved = resolveStoredCountry(selected ?? "", countryOther).trim();
  return resolved || null;
}

export function isUnknownCountry(value: string | null | undefined): boolean {
  const trimmed = value?.trim().toLowerCase() ?? "";
  return !trimmed || trimmed === "unknown";
}
