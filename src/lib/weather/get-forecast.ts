import "server-only";

import {
  resolveCoordinates,
  type HourlyWeatherPoint,
  type WeatherForecast,
  type WeatherLocationRef,
  type WeatherProvider,
} from "./provider";

let injectedProvider: WeatherProvider | null = null;

/** Test helper — inject a mocked provider without network calls. */
export function setWeatherProviderForTests(provider: WeatherProvider | null) {
  injectedProvider = provider;
}

function humidThreshold(): number {
  const raw = Number(process.env.WEATHER_HUMID_RH_THRESHOLD ?? "85");
  return Number.isFinite(raw) ? raw : 85;
}

function summarizeWetness(hourly: HourlyWeatherPoint[]): {
  consecutiveWetOrHumidHours: number;
  estimatedLeafWetnessRisk: "low" | "moderate" | "high";
} {
  const rhCut = humidThreshold();
  let streak = 0;
  let maxStreak = 0;

  for (const point of hourly) {
    const wet =
      (point.rainfallMm ?? 0) > 0.2 ||
      (point.relativeHumidityPct ?? 0) >= rhCut;
    if (wet) {
      streak += 1;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      streak = 0;
    }
  }

  let estimatedLeafWetnessRisk: "low" | "moderate" | "high" = "low";
  if (maxStreak >= 12) estimatedLeafWetnessRisk = "high";
  else if (maxStreak >= 6) estimatedLeafWetnessRisk = "moderate";

  return {
    consecutiveWetOrHumidHours: maxStreak,
    estimatedLeafWetnessRisk,
  };
}

/**
 * Open-Meteo free forecast provider (no API key).
 * Used when WEATHER_PROVIDER is unset or "open-meteo".
 */
export class OpenMeteoWeatherProvider implements WeatherProvider {
  readonly name = "open-meteo";

  async getForecast(location: WeatherLocationRef): Promise<WeatherForecast> {
    const coords = resolveCoordinates(location);
    const params = new URLSearchParams({
      latitude: String(coords.latitude),
      longitude: String(coords.longitude),
      current:
        "temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m,dew_point_2m",
      hourly:
        "temperature_2m,relative_humidity_2m,precipitation,precipitation_probability,wind_speed_10m,dew_point_2m",
      daily:
        "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
      forecast_days: "7",
      timezone: "auto",
    });

    const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });

    if (!response.ok) {
      throw new Error(`Weather provider failed (${response.status}).`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const retrievedAt = new Date().toISOString();

    const currentRaw =
      data.current && typeof data.current === "object"
        ? (data.current as Record<string, unknown>)
        : null;

    const hourlyRaw =
      data.hourly && typeof data.hourly === "object"
        ? (data.hourly as Record<string, unknown>)
        : {};
    const times = Array.isArray(hourlyRaw.time)
      ? (hourlyRaw.time as string[])
      : [];

    const hourly: HourlyWeatherPoint[] = times.slice(0, 168).map((time, i) => ({
      forecastTime: time,
      temperatureC: numAt(hourlyRaw.temperature_2m, i),
      relativeHumidityPct: numAt(hourlyRaw.relative_humidity_2m, i),
      rainfallMm: numAt(hourlyRaw.precipitation, i),
      precipitationProbabilityPct: numAt(
        hourlyRaw.precipitation_probability,
        i,
      ),
      windSpeedMps: numAt(hourlyRaw.wind_speed_10m, i),
      dewPointC: numAt(hourlyRaw.dew_point_2m, i),
    }));

    const dailyRaw =
      data.daily && typeof data.daily === "object"
        ? (data.daily as Record<string, unknown>)
        : {};
    const dailyTimes = Array.isArray(dailyRaw.time)
      ? (dailyRaw.time as string[])
      : [];

    const wetness = summarizeWetness(hourly.slice(0, 72));

    return {
      provider: this.name,
      location: {
        ...location,
        resolvedLatitude: coords.latitude,
        resolvedLongitude: coords.longitude,
      },
      retrievedAt,
      forecastHorizonHours: Math.min(hourly.length, 168),
      current: currentRaw
        ? {
            observedAt: String(currentRaw.time ?? retrievedAt),
            temperatureC: num(currentRaw.temperature_2m),
            relativeHumidityPct: num(currentRaw.relative_humidity_2m),
            rainfallMm: num(currentRaw.precipitation),
            precipitationProbabilityPct: num(
              currentRaw.precipitation_probability,
            ),
            windSpeedMps: num(currentRaw.wind_speed_10m),
            dewPointC: num(currentRaw.dew_point_2m),
          }
        : null,
      hourly,
      daily: dailyTimes.map((date, i) => ({
        forecastDate: date,
        temperatureMaxC: numAt(dailyRaw.temperature_2m_max, i),
        temperatureMinC: numAt(dailyRaw.temperature_2m_min, i),
        rainfallMm: numAt(dailyRaw.precipitation_sum, i),
        precipitationProbabilityPct: numAt(
          dailyRaw.precipitation_probability_max,
          i,
        ),
        relativeHumidityMaxPct: null,
      })),
      ...wetness,
    };
  }
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numAt(series: unknown, index: number): number | null {
  if (!Array.isArray(series)) return null;
  return num(series[index]);
}

export function getDefaultWeatherProvider(): WeatherProvider {
  if (injectedProvider) return injectedProvider;
  return new OpenMeteoWeatherProvider();
}

/**
 * Fetch a normalized forecast for a Caribbean farm location.
 */
export async function getForecast(
  location: WeatherLocationRef,
): Promise<WeatherForecast> {
  const provider = getDefaultWeatherProvider();
  return provider.getForecast(location);
}

/**
 * Build a deterministic humid/rainy mock forecast for automated tests.
 */
export function buildMockHumidRainyForecast(
  location: WeatherLocationRef = {
    country: "Trinidad and Tobago",
    district: "Chaguanas",
  },
): WeatherForecast {
  const coords = resolveCoordinates(location);
  const retrievedAt = new Date().toISOString();
  const start = Date.now();

  const hourly: HourlyWeatherPoint[] = Array.from({ length: 72 }, (_, i) => {
    const forecastTime = new Date(start + i * 3600_000).toISOString();
    return {
      forecastTime,
      temperatureC: 27 + (i % 5) * 0.4,
      relativeHumidityPct: 90 + (i % 3),
      rainfallMm: i % 4 === 0 ? 2.5 : 0.4,
      precipitationProbabilityPct: 70,
      windSpeedMps: 2.1,
      dewPointC: 24,
    };
  });

  const wetness = summarizeWetness(hourly);

  return {
    provider: "mock-humid-rainy",
    location: {
      ...location,
      resolvedLatitude: coords.latitude,
      resolvedLongitude: coords.longitude,
    },
    retrievedAt,
    forecastHorizonHours: 168,
    current: {
      observedAt: retrievedAt,
      temperatureC: 28,
      relativeHumidityPct: 92,
      rainfallMm: 1.2,
      precipitationProbabilityPct: 75,
      windSpeedMps: 2,
      dewPointC: 24.5,
    },
    hourly,
    daily: Array.from({ length: 7 }, (_, i) => ({
      forecastDate: new Date(start + i * 86_400_000)
        .toISOString()
        .slice(0, 10),
      temperatureMaxC: 31,
      temperatureMinC: 24,
      rainfallMm: 8 + i,
      precipitationProbabilityPct: 80,
      relativeHumidityMaxPct: 95,
    })),
    ...wetness,
  };
}
