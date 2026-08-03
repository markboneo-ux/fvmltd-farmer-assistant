/**
 * Reusable Caribbean / tropical country list for FVMLTD farmer forms.
 */

export const DEFAULT_COUNTRY = "Trinidad and Tobago";

export const OTHER_COUNTRY_OPTIONS = [
  "Other Caribbean Country",
  "Other Country",
] as const;

export const COUNTRY_OPTIONS = [
  "Trinidad and Tobago",
  "Guyana",
  "Grenada",
  "Saint Lucia",
  "Suriname",
  "The Bahamas",
  "Barbados",
  "Jamaica",
  "Antigua and Barbuda",
  "Saint Kitts and Nevis",
  "Belize",
  "Saint Vincent and the Grenadines",
  "Dominica",
  "Haiti",
  "Montserrat",
  "Anguilla",
  "British Virgin Islands",
  "Cayman Islands",
  "Turks and Caicos Islands",
  "Bermuda",
  "Aruba",
  "Curaçao",
  "Sint Maarten",
  "Other Caribbean Country",
  "Other Country",
] as const;

export type CountryOption = (typeof COUNTRY_OPTIONS)[number];

export function isOtherCountryOption(country: string): boolean {
  return (
    country === "Other Caribbean Country" || country === "Other Country"
  );
}

/** Resolve the value stored in the database from the select + optional Other text. */
export function resolveStoredCountry(
  country: string,
  countryOther: string,
): string {
  const selected = country.trim();
  if (isOtherCountryOption(selected)) {
    return countryOther.trim();
  }
  return selected;
}
