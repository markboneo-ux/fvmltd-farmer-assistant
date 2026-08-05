import type { WeatherForecast } from "@/lib/weather/provider";
import {
  rulesForCrop,
  type DiseaseRiskRule,
  type RiskLevel,
} from "./disease-risk-rules";

export type WeatherRiskAlert = {
  diseaseOrPest: string;
  riskLevel: RiskLevel;
  riskWindow: string;
  weatherDrivers: string[];
  cropStage: string | null;
  recommendedChecks: string[];
  preventiveActions: string[];
  confidence: "low" | "medium" | "high";
  dataSource: string;
  generatedAt: string;
  /** Explicitly not a diagnosis. */
  disclaimer: string;
  ruleId: string;
  ruleVersion: string;
};

export type WeatherRiskAssessmentInput = {
  country: string;
  district?: string | null;
  crop: string | null;
  variety?: string | null;
  cropStage?: string | null;
  productionSystem?: string | null;
  recentSymptoms?: string | null;
  forecast: WeatherForecast;
};

function countRainEvents72h(forecast: WeatherForecast): number {
  return forecast.hourly
    .slice(0, 72)
    .filter((point) => (point.rainfallMm ?? 0) > 0.2).length;
}

function avgNightTemperatureC(forecast: WeatherForecast): number | null {
  const nights = forecast.hourly.slice(0, 72).filter((point) => {
    const hour = new Date(point.forecastTime).getUTCHours();
    return hour >= 0 && hour <= 6;
  });
  const temps = nights
    .map((point) => point.temperatureC)
    .filter((value): value is number => typeof value === "number");
  if (temps.length === 0) return null;
  return temps.reduce((a, b) => a + b, 0) / temps.length;
}

function maxHumidity72h(forecast: WeatherForecast): number {
  return forecast.hourly
    .slice(0, 72)
    .reduce((max, point) => Math.max(max, point.relativeHumidityPct ?? 0), 0);
}

function matchesProductionSystem(
  rule: DiseaseRiskRule,
  productionSystem: string | null | undefined,
): boolean {
  if (!productionSystem) return true;
  const normalized = productionSystem.trim().toLowerCase().replace(/\s+/g, "_");
  return (
    rule.productionSystems.includes(normalized) ||
    rule.productionSystems.includes("other")
  );
}

function evaluateRule(
  rule: DiseaseRiskRule,
  input: WeatherRiskAssessmentInput,
): WeatherRiskAlert | null {
  if (!matchesProductionSystem(rule, input.productionSystem)) return null;

  const rainEvents = countRainEvents72h(input.forecast);
  const nightTemp = avgNightTemperatureC(input.forecast);
  const maxRh = maxHumidity72h(input.forecast);
  const wetHours = input.forecast.consecutiveWetOrHumidHours;
  const leafRisk = input.forecast.estimatedLeafWetnessRisk;

  const humidityOk = maxRh >= rule.thresholds.minRelativeHumidityPct;
  const wetOk = wetHours >= rule.thresholds.minConsecutiveWetOrHumidHours;
  const rainOk = rainEvents >= rule.thresholds.minRainEvents72h;
  const leafOk = rule.thresholds.leafWetnessLevels.includes(
    leafRisk as "moderate" | "high",
  );
  const nightOk =
    nightTemp === null || nightTemp >= rule.thresholds.minNightTemperatureC;

  // Foliar rules need wet/humid drivers; whitefly rule is warmth/humidity leaning.
  const triggered =
    rule.diseaseOrPest.includes("foliar")
      ? wetOk && humidityOk && (rainOk || leafOk) && nightOk
      : humidityOk && nightOk;

  if (!triggered) return null;

  let riskLevel: RiskLevel = rule.baseRiskLevel;
  if (wetHours >= rule.escalateToUrgentWhen.minConsecutiveWetOrHumidHours) {
    riskLevel = "urgent";
  }

  // Symptoms can raise confidence, never convert weather into a diagnosis.
  const symptomHint = (input.recentSymptoms || "").toLowerCase();
  let confidence: "low" | "medium" | "high" = "medium";
  if (
    symptomHint &&
    (symptomHint.includes("spot") ||
      symptomHint.includes("mould") ||
      symptomHint.includes("mold") ||
      symptomHint.includes("whitefly") ||
      symptomHint.includes("sticky"))
  ) {
    confidence = "high";
  } else if (!input.recentSymptoms) {
    confidence = "low";
  }

  return {
    diseaseOrPest: rule.diseaseOrPest,
    riskLevel,
    riskWindow: `next ${rule.riskWindowHours} hours`,
    weatherDrivers: [...rule.weatherDrivers],
    cropStage: input.cropStage ?? null,
    recommendedChecks: [...rule.recommendedChecks],
    preventiveActions: [...rule.preventiveActions],
    confidence,
    dataSource: `${input.forecast.provider} + ${rule.modelId}@${rule.version}`,
    generatedAt: new Date().toISOString(),
    disclaimer:
      "Weather-linked risk only — weather does not prove a diagnosis. Verify symptoms in the field before applying fungicides or insecticides.",
    ruleId: rule.id,
    ruleVersion: rule.version,
  };
}

/**
 * Combine crop context + verified forecast into risk warnings.
 * Never claims weather alone confirms a disease.
 */
export function assessWeatherDiseaseRisk(
  input: WeatherRiskAssessmentInput,
): WeatherRiskAlert[] {
  const rules = rulesForCrop(input.crop);
  const alerts: WeatherRiskAlert[] = [];

  for (const rule of rules) {
    const alert = evaluateRule(rule, input);
    if (alert) alerts.push(alert);
  }

  return alerts.sort((a, b) => riskRank(b.riskLevel) - riskRank(a.riskLevel));
}

function riskRank(level: RiskLevel): number {
  switch (level) {
    case "urgent":
      return 4;
    case "high":
      return 3;
    case "moderate":
      return 2;
    default:
      return 1;
  }
}

/** Farmer-facing plain-text block — no Markdown markers. */
export function formatWeatherRiskForFarmer(alert: WeatherRiskAlert): string {
  return [
    `Weather-linked risk: ${alert.riskLevel.toUpperCase()}`,
    "",
    "Potential concern:",
    `Conditions may favour ${alert.diseaseOrPest} during the ${alert.riskWindow}.`,
    "",
    "Weather drivers:",
    ...alert.weatherDrivers.map((driver) => `- ${driver}`),
    "",
    "Actions:",
    ...alert.preventiveActions.map((action) => `- ${action}`),
    "",
    alert.disclaimer,
  ].join("\n");
}
