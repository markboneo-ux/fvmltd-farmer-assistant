/**
 * Provider-independent weather contracts.
 * Concrete providers (Open-Meteo, mock, etc.) implement WeatherProvider.
 */

export type WeatherCoordinates = {
  latitude: number;
  longitude: number;
};

export type WeatherLocationRef = {
  country: string;
  district?: string | null;
  coordinates?: WeatherCoordinates | null;
  label?: string | null;
};

export type CurrentWeather = {
  observedAt: string;
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  rainfallMm: number | null;
  precipitationProbabilityPct: number | null;
  windSpeedMps: number | null;
  dewPointC: number | null;
};

export type HourlyWeatherPoint = {
  forecastTime: string;
  temperatureC: number | null;
  relativeHumidityPct: number | null;
  rainfallMm: number | null;
  precipitationProbabilityPct: number | null;
  windSpeedMps: number | null;
  dewPointC: number | null;
};

export type DailyWeatherPoint = {
  forecastDate: string;
  temperatureMaxC: number | null;
  temperatureMinC: number | null;
  rainfallMm: number | null;
  precipitationProbabilityPct: number | null;
  relativeHumidityMaxPct: number | null;
};

export type WeatherForecast = {
  provider: string;
  location: WeatherLocationRef & {
    resolvedLatitude: number;
    resolvedLongitude: number;
  };
  retrievedAt: string;
  forecastHorizonHours: number;
  current: CurrentWeather | null;
  hourly: HourlyWeatherPoint[];
  daily: DailyWeatherPoint[];
  /** Consecutive hours RH >= humid threshold or rainfall > 0. */
  consecutiveWetOrHumidHours: number;
  /** Estimated when direct leaf-wetness is unavailable. */
  estimatedLeafWetnessRisk: "low" | "moderate" | "high";
};

export type WeatherProvider = {
  readonly name: string;
  getForecast(location: WeatherLocationRef): Promise<WeatherForecast>;
};

/** Default Trinidad & Tobago district centroids for Phase 1. */
export const TT_DISTRICT_COORDINATES: Record<string, WeatherCoordinates> = {
  "port of spain": { latitude: 10.6549, longitude: -61.5019 },
  "san fernando": { latitude: 10.2833, longitude: -61.4667 },
  chaguanas: { latitude: 10.5167, longitude: -61.4167 },
  arima: { latitude: 10.6333, longitude: -61.2833 },
  "point fortin": { latitude: 10.1667, longitude: -61.6833 },
  "sangre grande": { latitude: 10.5871, longitude: -61.1321 },
  tobago: { latitude: 11.181, longitude: -60.735 },
  default: { latitude: 10.6918, longitude: -61.2225 },
};

export function resolveCoordinates(
  location: WeatherLocationRef,
): WeatherCoordinates {
  if (
    location.coordinates &&
    Number.isFinite(location.coordinates.latitude) &&
    Number.isFinite(location.coordinates.longitude)
  ) {
    return location.coordinates;
  }

  const district = (location.district || "").trim().toLowerCase();
  if (district && TT_DISTRICT_COORDINATES[district]) {
    return TT_DISTRICT_COORDINATES[district];
  }

  const country = location.country.trim().toLowerCase();
  if (country.includes("tobago")) {
    return TT_DISTRICT_COORDINATES.tobago;
  }

  return TT_DISTRICT_COORDINATES.default;
}
