import { describe, expect, it } from "vitest";
import { buildMockHumidRainyForecast } from "@/lib/weather/get-forecast";
import {
  assessWeatherDiseaseRisk,
  formatWeatherRiskForFarmer,
} from "./weather-risk";

describe("weather-linked disease risk", () => {
  it("generates a weather-linked risk warning from humid rainy forecast", () => {
    const forecast = buildMockHumidRainyForecast({
      country: "Trinidad and Tobago",
      district: "Chaguanas",
    });

    expect(forecast.consecutiveWetOrHumidHours).toBeGreaterThanOrEqual(8);
    expect(forecast.estimatedLeafWetnessRisk).toBe("high");

    const alerts = assessWeatherDiseaseRisk({
      country: "Trinidad and Tobago",
      district: "Chaguanas",
      crop: "tomato",
      productionSystem: "open_field",
      recentSymptoms: "leaf spots after rain",
      forecast,
    });

    expect(alerts.length).toBeGreaterThan(0);
    const foliar = alerts.find((alert) =>
      /foliar/i.test(alert.diseaseOrPest),
    );
    expect(foliar).toBeTruthy();
    expect(["high", "urgent"]).toContain(foliar?.riskLevel);
    expect(foliar?.riskWindow).toMatch(/72/);
    expect(foliar?.weatherDrivers.length).toBeGreaterThan(0);
    expect(foliar?.recommendedChecks.length).toBeGreaterThan(0);
    expect(foliar?.preventiveActions.length).toBeGreaterThan(0);
    expect(foliar?.disclaimer.toLowerCase()).toMatch(/does not prove/);

    const text = formatWeatherRiskForFarmer(foliar!);
    expect(text).toMatch(/Weather-linked risk:/i);
    expect(text).not.toMatch(/confirmed diagnosis/i);
    expect(text).not.toMatch(/###|\*\*/);
  });

  it("does not treat weather alone as a confirmed diagnosis", () => {
    const forecast = buildMockHumidRainyForecast();
    const alerts = assessWeatherDiseaseRisk({
      country: "Trinidad and Tobago",
      crop: "tomato",
      forecast,
    });

    expect(alerts).toEqual([]);
  });

  it("does not apply tomato blight models to celery or unknown crops", () => {
    const forecast = buildMockHumidRainyForecast();
    expect(
      assessWeatherDiseaseRisk({
        country: "Trinidad and Tobago",
        crop: "celery",
        recentSymptoms: "outer leaves burning",
        forecast,
      }),
    ).toEqual([]);
    expect(
      assessWeatherDiseaseRisk({
        country: "Trinidad and Tobago",
        crop: null,
        recentSymptoms: "leaf spots after rain",
        forecast,
      }),
    ).toEqual([]);
  });

  it("does not create whitefly pressure from warmth alone", () => {
    const forecast = buildMockHumidRainyForecast();
    const alerts = assessWeatherDiseaseRisk({
      country: "Trinidad and Tobago",
      crop: "tomato",
      recentSymptoms: "plants look weak",
      forecast,
    });
    expect(alerts.some((alert) => /whitefly/i.test(alert.diseaseOrPest))).toBe(false);
  });
});
