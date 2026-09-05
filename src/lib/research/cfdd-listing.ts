/**
 * Parse public CFDD pesticide product listing pages.
 * A portal/homepage is not a listing. Only pages with a registration number
 * or registered status count as retrieved evidence.
 */

export type ParsedPesticideListing = {
  tradeName: string | null;
  activeIngredient: string | null;
  registrationNumber: string | null;
  status: string | null;
  url: string;
};

const TRAILING_LABEL =
  /\s+(Active Ingredient(?: Percentage)?|Form|Use|Status|Registration No\.?|Toxicity Class|Applicant)\b[\s\S]*$/i;

export function parsePesticideListingText(
  text: string,
  url: string,
): ParsedPesticideListing | null {
  const blob = text.replace(/\s+/g, " ").trim();
  if (!blob) return null;

  const registrationNumber =
    blob.match(/\bTTPR[0-9-]+\b/i)?.[0]?.toUpperCase() ??
    blob.match(/\bRegistration No\.?\s*([A-Z]{2,6}[0-9-]+)/i)?.[1]?.toUpperCase() ??
    null;
  const status = /\bStatus\s+Registered\b/i.test(blob)
    ? "Registered"
    : /\bStatus\s+([A-Za-z][A-Za-z ]{2,20})/i.exec(blob)?.[1]?.trim() ?? null;
  const tradeName = cleanCaptured(
    blob.match(/\bPesticide Name\s+(.{2,80}?)\s+Registration No/i)?.[1] ??
      blob.match(/\bPesticide\s+-\s+([^|<]{2,80})/i)?.[1] ??
      null,
  );
  const activeIngredient = cleanCaptured(
    blob.match(/\bActive Ingredients?\s+(.{2,60}?)\s+Active Ingredient Percentage/i)?.[1] ??
      blob.match(/\bActive Ingredients?\s+([A-Za-z][A-Za-z0-9-]{2,40})/i)?.[1] ??
      null,
  );

  if (!registrationNumber && !/\bregistered\b/i.test(status || "")) {
    return null;
  }

  return {
    tradeName,
    activeIngredient,
    registrationNumber,
    status,
    url,
  };
}

function cleanCaptured(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(TRAILING_LABEL, "").replace(/\s+/g, " ").trim();
  return cleaned || null;
}

export function formatListingSample(item: ParsedPesticideListing): string {
  const parts = [
    item.tradeName,
    item.activeIngredient,
    item.registrationNumber,
    item.status,
  ].filter((part): part is string => Boolean(part));
  return parts.join(" — ");
}
