/**
 * Translate recent + forecast weather into agronomic significance.
 * Weather must never be mentioned just to sound local.
 */

import type { DailyWeatherPoint, WeatherForecast } from "@/lib/weather/provider";

export const AGRONOMIC_WEATHER_SIGNALS = [
  "prolonged_wetness",
  "heavy_rain_risk",
  "heat_stress",
  "dry_conditions",
  "disease_pressure",
  "poor_spray_timing",
] as const;

export type AgronomicWeatherSignal = (typeof AGRONOMIC_WEATHER_SIGNALS)[number];

export type AgronomicWeatherSummary = {
  recentRainfallMm: number | null;
  forecastRainfallMm: number | null;
  recentMeanTempC: number | null;
  forecastMaxTempC: number | null;
  recentMeanHumidityPct: number | null;
  signals: AgronomicWeatherSignal[];
  farmerBrief: string | null;
  recentRainfallLabel: string | null;
  forecastRainfallLabel: string | null;
  temperatureLabel: string | null;
  humidityLabel: string | null;
};

function sumRain(days: DailyWeatherPoint[]): number | null {
  const values = days
    .map((day) => day.rainfallMm)
    .filter((value): value is number => typeof value === "number");
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((value): value is number => typeof value === "number");
  if (nums.length === 0) return null;
  return nums.reduce((total, value) => total + value, 0) / nums.length;
}

function maxValue(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((value): value is number => typeof value === "number");
  if (nums.length === 0) return null;
  return Math.max(...nums);
}

export function summarizeAgronomicWeather(
  forecast: WeatherForecast,
): AgronomicWeatherSummary {
  const recent = forecast.recentDaily ?? [];
  const upcoming = (forecast.forecastDaily ?? forecast.daily).slice(0, 7);
  const recentRainfallMm = sumRain(recent);
  const forecastRainfallMm = sumRain(upcoming.slice(0, 5));
  const recentMeanTempC = mean(
    recent.map((day) => {
      if (day.temperatureMaxC == null && day.temperatureMinC == null) return null;
      return ((day.temperatureMaxC ?? day.temperatureMinC ?? 0) +
        (day.temperatureMinC ?? day.temperatureMaxC ?? 0)) /
        2;
    }),
  );
  const forecastMaxTempC = maxValue(upcoming.map((day) => day.temperatureMaxC));
  const recentMeanHumidityPct =
    mean(recent.map((day) => day.relativeHumidityMaxPct)) ??
    mean(forecast.hourly.slice(0, 24).map((point) => point.relativeHumidityPct));

  const signals: AgronomicWeatherSignal[] = [];
  const wetHours = forecast.consecutiveWetOrHumidHours;
  const leaf = forecast.estimatedLeafWetnessRisk;
  const nextDayRain = upcoming[0]?.rainfallMm ?? 0;
  const nextDayChance = upcoming[0]?.precipitationProbabilityPct ?? 0;

  if (
    (recentRainfallMm ?? 0) >= 40 ||
    wetHours >= 12 ||
    leaf === "high" ||
    recent.filter((day) => (day.rainfallMm ?? 0) >= 8).length >= 3
  ) {
    signals.push("prolonged_wetness");
    signals.push("disease_pressure");
  }
  if ((forecastRainfallMm ?? 0) >= 25 || nextDayRain >= 10 || nextDayChance >= 70) {
    signals.push("heavy_rain_risk");
    signals.push("poor_spray_timing");
  }
  if ((forecastMaxTempC ?? 0) >= 33 || (recentMeanTempC ?? 0) >= 32) {
    signals.push("heat_stress");
  }
  if ((recentRainfallMm ?? 0) < 5 && recent.length >= 5 && (forecastRainfallMm ?? 0) < 5) {
    signals.push("dry_conditions");
  }

  const unique = [...new Set(signals)];
  const farmerBrief = farmerWeatherImplication(unique, {
    recentRainfallMm,
    forecastRainfallMm,
    forecastMaxTempC,
    nextDayChance,
  });

  return {
    recentRainfallMm,
    forecastRainfallMm,
    recentMeanTempC,
    forecastMaxTempC,
    recentMeanHumidityPct,
    signals: unique,
    farmerBrief,
    recentRainfallLabel:
      recentRainfallMm == null
        ? null
        : `about ${Math.round(recentRainfallMm)} mm over the last ${Math.max(recent.length, 1)} days`,
    forecastRainfallLabel:
      forecastRainfallMm == null
        ? null
        : `about ${Math.round(forecastRainfallMm)} mm possible over the next few days`,
    temperatureLabel:
      forecastMaxTempC == null ? null : `highs near ${Math.round(forecastMaxTempC)}°C`,
    humidityLabel:
      recentMeanHumidityPct == null
        ? null
        : `humidity around ${Math.round(recentMeanHumidityPct)}%`,
  };
}

export function farmerWeatherImplication(
  signals: AgronomicWeatherSignal[],
  extras?: {
    recentRainfallMm?: number | null;
    forecastRainfallMm?: number | null;
    forecastMaxTempC?: number | null;
    nextDayChance?: number | null;
  },
): string | null {
  if (signals.length === 0) return null;
  const parts: string[] = [];
  if (signals.includes("prolonged_wetness")) {
    parts.push("the crop has had a stretch of wet weather, so leaves and roots have stayed damp");
  }
  if (signals.includes("disease_pressure")) {
    parts.push("that kind of wetness can raise leaf-disease pressure");
  }
  if (signals.includes("heavy_rain_risk")) {
    parts.push("more heavy rain is possible, which can splash soil onto leaves and wash spray off");
  }
  if (signals.includes("poor_spray_timing") && !signals.includes("heavy_rain_risk")) {
    parts.push("spray timing looks poor until there is a dry gap");
  }
  if (signals.includes("heat_stress")) {
    parts.push(
      extras?.forecastMaxTempC
        ? `heat stress is likely with highs near ${Math.round(extras.forecastMaxTempC)}°C`
        : "heat stress is likely on the hottest days",
    );
  }
  if (signals.includes("dry_conditions")) {
    parts.push("recent weather has been dry, so water stress can look like a disease");
  }
  if (parts.length === 0) return null;
  const sentence = parts.join(". ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

export function weatherLabelsForCase(summary: AgronomicWeatherSummary): {
  recentRainfall: string | null;
  forecastRainfall: string | null;
  temperature: string | null;
  humidity: string | null;
} {
  return {
    recentRainfall: summary.recentRainfallLabel,
    forecastRainfall: summary.forecastRainfallLabel,
    temperature: summary.temperatureLabel,
    humidity: summary.humidityLabel,
  };
}
