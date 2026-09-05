import "server-only";

import { getForecast } from "@/lib/weather/get-forecast";
import type { WeatherCoordinates } from "@/lib/weather/provider";
import {
  assessWeatherDiseaseRisk,
  type WeatherRiskAlert,
} from "./weather-risk";

export type GetWeatherDiseaseRiskArgs = {
  country: string;
  district?: string | null;
  coordinates?: WeatherCoordinates | null;
  crop: string;
  variety?: string | null;
  cropStage?: string | null;
  productionSystem?: string | null;
  recentSymptoms?: string | null;
};

export type GetWeatherDiseaseRiskResult = {
  country: string;
  district: string | null;
  crop: string;
  weatherDataAsOf: string | null;
  provider: string | null;
  alerts: WeatherRiskAlert[];
  /** True when weather tools ran successfully. */
  verified: boolean;
  error: string | null;
};

/**
 * Server tool: get_weather_disease_risk
 * Combines provider forecast + agronomist-approved editable rules.
 */
export async function getWeatherDiseaseRisk(
  args: GetWeatherDiseaseRiskArgs,
): Promise<GetWeatherDiseaseRiskResult> {
  const country = args.country?.trim() || "";
  const crop = args.crop?.trim().toLowerCase() || "";

  if (!country) {
    return {
      country: "",
      district: args.district ?? null,
      crop,
      weatherDataAsOf: null,
      provider: null,
      alerts: [],
      verified: false,
      error: "Country is required for a local weather risk forecast.",
    };
  }

  if (!crop) {
    return {
      country,
      district: args.district ?? null,
      crop,
      weatherDataAsOf: null,
      provider: null,
      alerts: [],
      verified: false,
      error: "Crop is required.",
    };
  }

  try {
    const forecast = await getForecast({
      country,
      district: args.district,
      coordinates: args.coordinates,
    });

    const alerts = assessWeatherDiseaseRisk({
      country,
      district: args.district,
      crop,
      variety: args.variety,
      cropStage: args.cropStage,
      productionSystem: args.productionSystem,
      recentSymptoms: args.recentSymptoms,
      forecast,
    });

    return {
      country,
      district: args.district ?? null,
      crop,
      weatherDataAsOf: forecast.retrievedAt,
      provider: forecast.provider,
      alerts,
      verified: true,
      error: null,
    };
  } catch (error) {
    return {
      country,
      district: args.district ?? null,
      crop,
      weatherDataAsOf: null,
      provider: null,
      alerts: [],
      verified: false,
      error:
        error instanceof Error
          ? error.message
          : "Weather risk tool failed.",
    };
  }
}
