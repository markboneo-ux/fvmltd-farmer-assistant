import { listCropCases, listOutcomes, logCasePersistenceBackend } from "./store";
import type { SimilarCaseMatch, SimilarCaseQuery } from "./types";
import { trustedCaseForSimilarity } from "@/lib/trends/ingest";

function overlap(a: string[] | undefined, b: string[] | undefined): number {
  if (!a?.length || !b?.length) return 0;
  const left = new Set(a.map((item) => item.toLowerCase()));
  let score = 0;
  for (const item of b) {
    if (left.has(item.toLowerCase())) score += 1;
  }
  return score;
}

/**
 * Rank similar cases. Higher when reviewed, confirmed, outcome recorded,
 * same region, same crop/variety, similar symptoms, similar weather.
 * Never includes another farmer's identity.
 */
export async function getSimilarCases(
  query: SimilarCaseQuery,
  limit = 5,
): Promise<SimilarCaseMatch[]> {
  const allCases = await listCropCases();
  logCasePersistenceBackend();
  const allOutcomes = await listOutcomes();
  const casesWithOutcome = new Set(allOutcomes.map((item) => item.caseId));

  const scored = allCases
    .map((item) => {
      const trusted = trustedCaseForSimilarity(item, casesWithOutcome.has(item.id));
      if (!trusted) {
        return { caseId: item.id, score: 0, reasons: [] as string[], farmerFacingSummary: "" };
      }
      let score = 0;
      const reasons: string[] = [];

      if (item.agronomistReviewed) {
        score += 40;
        reasons.push("agronomist review");
      }
      if (item.diagnosisConfirmed) {
        score += 30;
        reasons.push("confirmed diagnosis");
      }
      if (casesWithOutcome.has(item.id)) {
        score += 25;
        reasons.push("recorded outcome");
      }
      if (
        query.district &&
        item.district &&
        query.district.toLowerCase() === item.district.toLowerCase()
      ) {
        score += 20;
        reasons.push("same region");
      }
      if (
        query.country &&
        item.country &&
        query.country.toLowerCase() === item.country.toLowerCase()
      ) {
        score += 8;
        reasons.push("same country");
      }
      if (query.crop && item.crop && query.crop.toLowerCase() === item.crop.toLowerCase()) {
        score += 16;
        reasons.push("same crop");
      }
      if (
        query.variety &&
        item.variety &&
        query.variety.toLowerCase() === item.variety.toLowerCase()
      ) {
        score += 12;
        reasons.push("same variety");
      }
      const symptomHits = overlap(query.symptoms, item.symptoms);
      if (symptomHits > 0) {
        score += symptomHits * 8;
        reasons.push("similar symptoms");
      }
      if (
        query.problemCategory &&
        item.problemCategory &&
        query.problemCategory === item.problemCategory
      ) {
        score += 10;
        reasons.push("same problem");
      }
      if (
        query.productionSystem &&
        item.productionSystem &&
        query.productionSystem === item.productionSystem
      ) {
        score += 6;
      }
      if (
        query.weatherContext &&
        item.weatherRisk &&
        query.weatherContext.toLowerCase().includes(item.weatherRisk.toLowerCase())
      ) {
        score += 8;
        reasons.push("similar weather");
      }

      const farmerFacingSummary = buildFarmerFacingSimilarSummary(item, reasons);
      return { caseId: item.id, score, reasons, farmerFacingSummary };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}

function buildFarmerFacingSimilarSummary(
  item: { district: string | null; crop: string | null; drainage: string | null; weatherRisk: string | null },
  reasons: string[],
): string {
  const area = item.district ? " in your area" : "";
  if (item.drainage || /wet/i.test(item.weatherRisk ?? "") || reasons.includes("similar weather")) {
    return `We have seen similar reports recently${area}, so this is worth checking. Check whether the soil is staying wet too long before adding more fertilizer.`;
  }
  return `We have seen similar reports recently${area}, so this is worth checking. Look at the plants closely before making a big change.`;
}
