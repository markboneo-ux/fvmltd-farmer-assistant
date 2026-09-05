import type { WeatherForecast } from "@/lib/weather/provider";

/**
 * Plain-language forecast for spray/plant/harvest timing.
 */
export function formatForecastTimingBrief(forecast: WeatherForecast): string {
  const tomorrow = forecast.daily[1] ?? forecast.daily[0];
  if (!tomorrow) {
    return "I could not read a local forecast just now.";
  }
  const rainMm = tomorrow.rainfallMm ?? 0;
  const chance = tomorrow.precipitationProbabilityPct ?? 0;
  const rainLikely = chance >= 50 || rainMm >= 2;
  const wind = forecast.current?.windSpeedMps ?? null;
  const windNote =
    wind != null && wind >= 5
      ? " Wind looks brisk, which can drift spray."
      : " Wind looks light.";

  if (rainLikely) {
    return `Rain looks likely tomorrow (about ${Math.round(chance)}% chance, around ${rainMm.toFixed(1)} mm). Wait for a dry gap before you spray so the product does not wash off.${windNote}`;
  }
  return `Rain looks less likely tomorrow (about ${Math.round(chance)}% chance). That is a better window for spraying if leaves are dry.${windNote}`;
}

export function forecastLooksWetOrHumid(forecast: WeatherForecast): boolean {
  return (
    forecast.consecutiveWetOrHumidHours >= 6 ||
    forecast.estimatedLeafWetnessRisk !== "low" ||
    (forecast.daily[0]?.rainfallMm ?? 0) >= 2
  );
}

export function forecastLooksHot(forecast: WeatherForecast): boolean {
  const max = forecast.daily[0]?.temperatureMaxC ?? forecast.current?.temperatureC;
  return typeof max === "number" && max >= 33;
}
