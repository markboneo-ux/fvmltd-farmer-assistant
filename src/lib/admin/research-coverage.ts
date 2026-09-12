import { RESEARCH_COUNTRIES } from "@/lib/research/countries";
import { TRUSTED_SOURCES } from "@/lib/research/sources";
import { CARIBBEAN_COUNTRY_COORDINATES } from "@/lib/weather/provider";

export type CoverageStatus = "Verified" | "Partial" | "Missing";

export type CountryResearchCoverage = {
  country: string;
  pesticideRegistry: CoverageStatus;
  weather: CoverageStatus;
  marketData: CoverageStatus;
  officialAgriculture: CoverageStatus;
  lastVerifiedDate: string | null;
  status: CoverageStatus;
};

function sourceStatus(
  country: string,
  sourceType: "regulator" | "market_data" | "government",
): { status: CoverageStatus; lastVerified: string | null } {
  const matches = TRUSTED_SOURCES.filter(
    (item) =>
      item.country === country &&
      item.sourceType === sourceType &&
      item.active &&
      item.domain &&
      item.trustLevel === "official",
  );
  if (matches.length === 0) return { status: "Missing", lastVerified: null };
  const lastVerified = matches
    .map((item) => item.lastReviewedAt)
    .filter((item): item is string => Boolean(item))
    .sort()
    .at(-1) ?? null;
  return { status: "Verified", lastVerified };
}

function weatherStatus(country: string): CoverageStatus {
  return CARIBBEAN_COUNTRY_COORDINATES[country.toLowerCase()] ? "Verified" : "Missing";
}

function combine(parts: CoverageStatus[]): CoverageStatus {
  const verified = parts.filter((item) => item === "Verified").length;
  if (verified === parts.length) return "Verified";
  if (verified === 0) return "Missing";
  return "Partial";
}

export function buildResearchCoverage(): CountryResearchCoverage[] {
  return RESEARCH_COUNTRIES.map((country) => {
    const pesticide = sourceStatus(country, "regulator");
    const market = sourceStatus(country, "market_data");
    const official = sourceStatus(country, "government");
    const weather = weatherStatus(country);
    const lastVerifiedDate = [pesticide.lastVerified, market.lastVerified, official.lastVerified]
      .filter((item): item is string => Boolean(item))
      .sort()
      .at(-1) ?? null;
    return {
      country,
      pesticideRegistry: pesticide.status,
      weather,
      marketData: market.status,
      officialAgriculture: official.status,
      lastVerifiedDate,
      status: combine([pesticide.status, weather, market.status, official.status]),
    };
  });
}
