/**
 * Staff/Preview weather retrieval diagnostics.
 * Never render these fields in farmer-facing UI.
 */

export type WeatherProviderResult = "success" | "failed" | "skipped";

export type WeatherRetrievalDebug = {
  resolvedLocation: {
    country: string | null;
    farmingArea: string | null;
    coordinates: { latitude: number; longitude: number } | null;
  };
  providerResult: WeatherProviderResult;
  providerName: string | null;
  recentPeriodAvailable: boolean;
  forecastAvailable: boolean;
  signals: string[];
  materiallyChangedDiagnosis: boolean;
  error: string | null;
};

export function emptyWeatherDebug(
  overrides: Partial<WeatherRetrievalDebug> = {},
): WeatherRetrievalDebug {
  return {
    resolvedLocation: {
      country: overrides.resolvedLocation?.country ?? null,
      farmingArea: overrides.resolvedLocation?.farmingArea ?? null,
      coordinates: overrides.resolvedLocation?.coordinates ?? null,
    },
    providerResult: overrides.providerResult ?? "skipped",
    providerName: overrides.providerName ?? null,
    recentPeriodAvailable: overrides.recentPeriodAvailable ?? false,
    forecastAvailable: overrides.forecastAvailable ?? false,
    signals: overrides.signals ?? [],
    materiallyChangedDiagnosis: overrides.materiallyChangedDiagnosis ?? false,
    error: overrides.error ?? null,
  };
}

export function logWeatherDebug(debug: WeatherRetrievalDebug) {
  console.info("[fvm-weather-debug]", JSON.stringify(debug));
}
