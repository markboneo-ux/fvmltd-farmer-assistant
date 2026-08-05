/**
 * Versioned, agronomist-editable disease-risk rules.
 * Thresholds live here — never invent them inside the AI prompt.
 */

export type RiskLevel = "low" | "moderate" | "high" | "urgent";

export type DiseaseRiskRule = {
  id: string;
  modelId: string;
  version: string;
  crop: string;
  diseaseOrPest: string;
  productionSystems: string[];
  agronomistApproved: boolean;
  approvedBy: string;
  approvedAt: string;
  /** Editable thresholds — not hardcoded in prompts. */
  thresholds: {
    minConsecutiveWetOrHumidHours: number;
    minRelativeHumidityPct: number;
    minNightTemperatureC: number;
    minRainEvents72h: number;
    leafWetnessLevels: Array<"moderate" | "high">;
  };
  riskWindowHours: number;
  weatherDrivers: string[];
  recommendedChecks: string[];
  preventiveActions: string[];
  baseRiskLevel: RiskLevel;
  escalateToUrgentWhen: {
    minConsecutiveWetOrHumidHours: number;
  };
};

export const TOMATO_FOLIAR_DISEASE_RULE_V1: DiseaseRiskRule = {
  id: "rule_tomato_foliar_humid_v1",
  modelId: "model_tomato_foliar_caribbean_v1",
  version: "1.0.0",
  crop: "tomato",
  diseaseOrPest: "foliar disease complex (early blight / late blight pressure)",
  productionSystems: ["open_field", "shade_house", "greenhouse", "other"],
  agronomistApproved: true,
  approvedBy: "FVMLTD Agronomy (Phase 1 seed)",
  approvedAt: "2026-08-05T00:00:00.000Z",
  thresholds: {
    minConsecutiveWetOrHumidHours: 8,
    minRelativeHumidityPct: 85,
    minNightTemperatureC: 18,
    minRainEvents72h: 3,
    leafWetnessLevels: ["moderate", "high"],
  },
  riskWindowHours: 72,
  weatherDrivers: [
    "repeated rainfall",
    "extended high humidity",
    "warm night temperatures",
  ],
  recommendedChecks: [
    "inspect lower and inner leaves",
    "look for water-soaked spots, target lesions, or white fungal growth",
    "photograph new symptoms before any spray decision",
  ],
  preventiveActions: [
    "improve airflow where practical",
    "avoid unnecessary overhead irrigation",
    "verify disease before applying a fungicide",
    "remove severely affected lower leaves if plants are strong enough",
  ],
  baseRiskLevel: "high",
  escalateToUrgentWhen: {
    minConsecutiveWetOrHumidHours: 18,
  },
};

export const TOMATO_WHITEFLY_PRESSURE_RULE_V1: DiseaseRiskRule = {
  id: "rule_tomato_whitefly_warm_v1",
  modelId: "model_tomato_whitefly_caribbean_v1",
  version: "1.0.0",
  crop: "tomato",
  diseaseOrPest: "whitefly population pressure",
  productionSystems: ["open_field", "shade_house", "greenhouse", "other"],
  agronomistApproved: true,
  approvedBy: "FVMLTD Agronomy (Phase 1 seed)",
  approvedAt: "2026-08-05T00:00:00.000Z",
  thresholds: {
    minConsecutiveWetOrHumidHours: 0,
    minRelativeHumidityPct: 60,
    minNightTemperatureC: 22,
    minRainEvents72h: 0,
    leafWetnessLevels: ["moderate", "high"],
  },
  riskWindowHours: 72,
  weatherDrivers: [
    "warm day and night temperatures",
    "humid canopy conditions favouring rapid insect build-up",
  ],
  recommendedChecks: [
    "turn over leaves and count adult whiteflies",
    "check for sticky residue or sooty mould",
    "compare few plants versus patches versus most of field",
  ],
  preventiveActions: [
    "scout early morning",
    "remove heavily infested lower leaves when practical",
    "avoid repeating the same insecticide without checking results",
  ],
  baseRiskLevel: "moderate",
  escalateToUrgentWhen: {
    minConsecutiveWetOrHumidHours: 48,
  },
};

/** Approved editable rule set — architecture ready for pepper/cucumber models. */
export const APPROVED_DISEASE_RISK_RULES: DiseaseRiskRule[] = [
  TOMATO_FOLIAR_DISEASE_RULE_V1,
  TOMATO_WHITEFLY_PRESSURE_RULE_V1,
];

export function rulesForCrop(crop: string | null | undefined): DiseaseRiskRule[] {
  if (!crop) return [];
  const normalized = crop.trim().toLowerCase();
  return APPROVED_DISEASE_RISK_RULES.filter(
    (rule) => rule.crop === normalized && rule.agronomistApproved,
  );
}
