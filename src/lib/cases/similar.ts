/**
 * Rank similar cases. Higher when reviewed, confirmed, outcome recorded,
 * same region, same crop/variety, similar symptoms, similar weather.
 * Never includes another farmer's identity.
 *
 * Hard gate before any farmer-facing similar-case sentence:
 * currentCrop != null
 * AND retrievedCaseCrop == currentCrop
 * AND symptom overlap >= threshold
 * AND unique farmer count >= configured threshold
 *
 * Never substitute tomato (or any other crop).
 */

import { listCropCases, listOutcomes, logCasePersistenceBackend } from "./store";
import type { CropCaseRecord, SimilarCaseMatch, SimilarCaseQuery } from "./types";
import { trustedCaseForSimilarity } from "@/lib/trends/ingest";
import { learningWeight } from "@/lib/assistant/knowledge";

export const SIMILAR_CASE_UNIQUE_FARMER_THRESHOLD = 2;
export const SIMILAR_CASE_SYMPTOM_THRESHOLD = 1;

function sessionKey(record: Pick<CropCaseRecord, "id" | "userId" | "anonymousSessionId">): string {
  return record.userId || record.anonymousSessionId || record.id;
}

function overlap(a: string[] | undefined, b: string[] | undefined): number {
  if (!a?.length || !b?.length) return 0;
  const left = new Set(a.map((item) => item.toLowerCase()));
  let score = 0;
  for (const item of b) {
    if (left.has(item.toLowerCase())) score += 1;
  }
  return score;
}

function sameCrop(queryCrop: string | null | undefined, itemCrop: string | null | undefined): boolean {
  if (!queryCrop || !itemCrop) return false;
  return queryCrop.trim().toLowerCase() === itemCrop.trim().toLowerCase();
}

export function farmerFacingSimilarSummary(crop: string): string {
  return `We have seen similar ${crop} cases. Use that only as a check, not as a diagnosis of your plants.`;
}

function qualifiesMatch(
  query: SimilarCaseQuery,
  item: CropCaseRecord,
  symptomHits: number,
): boolean {
  if (!sameCrop(query.crop, item.crop)) return false;
  if (symptomHits < SIMILAR_CASE_SYMPTOM_THRESHOLD) return false;
  return true;
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
  const currentCrop = query.crop?.trim().toLowerCase() || null;
  if (!currentCrop) return [];

  const allCases = await listCropCases();
  logCasePersistenceBackend();
  const allOutcomes = await listOutcomes();
  const casesWithOutcome = new Set(allOutcomes.map((item) => item.caseId));

  const scored = allCases
    .map((item) => {
      const trusted = trustedCaseForSimilarity(item, casesWithOutcome.has(item.id));
      const weight = learningWeight({
        agronomistReviewed: item.agronomistReviewed,
        diagnosisConfirmed: item.diagnosisConfirmed,
        knowledgeState: item.knowledgeState,
        outcome: casesWithOutcome.has(item.id) ? "improved" : null,
      });
      if (!trusted && weight < 8) {
        return { caseId: item.id, score: 0, reasons: [] as string[], farmerFacingSummary: "" };
      }
      if (!sameCrop(currentCrop, item.crop)) {
        return { caseId: item.id, score: 0, reasons: [] as string[], farmerFacingSummary: "" };
      }

      let score = 0;
      const reasons: string[] = [];
      const symptomHits = overlap(query.symptoms, item.symptoms);

      if (!qualifiesMatch(query, item, symptomHits)) {
        return { caseId: item.id, score: 0, reasons: [] as string[], farmerFacingSummary: "" };
      }

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
      if (!item.agronomistReviewed && !item.diagnosisConfirmed && !casesWithOutcome.has(item.id)) {
        score += 2;
        reasons.push("unconfirmed AI case");
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
      score += 16;
      reasons.push("same crop");
      if (
        query.variety &&
        item.variety &&
        query.variety.toLowerCase() === item.variety.toLowerCase()
      ) {
        score += 12;
        reasons.push("same variety");
      }
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

      return {
        caseId: item.id,
        score,
        reasons,
        farmerFacingSummary: farmerFacingSimilarSummary(currentCrop),
        uniqueFarmerKey: sessionKey(item),
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const uniqueFarmers = new Set(scored.map((item) => item.uniqueFarmerKey));
  if (uniqueFarmers.size < SIMILAR_CASE_UNIQUE_FARMER_THRESHOLD) {
    return [];
  }

  return scored.slice(0, limit).map(({ uniqueFarmerKey: _key, ...item }) => item);
}

export function similarCaseHardGate(options: {
  currentCrop: string | null | undefined;
  retrievedCrop: string | null | undefined;
  symptomSimilarity: number;
  uniqueFarmerCount: number;
}): boolean {
  const current = options.currentCrop?.trim().toLowerCase() || null;
  const retrieved = options.retrievedCrop?.trim().toLowerCase() || null;
  if (!current) return false;
  if (!retrieved || retrieved !== current) return false;
  if (options.symptomSimilarity < SIMILAR_CASE_SYMPTOM_THRESHOLD) return false;
  if (options.uniqueFarmerCount < SIMILAR_CASE_UNIQUE_FARMER_THRESHOLD) return false;
  return true;
}
