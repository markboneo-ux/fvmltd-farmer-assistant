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

    for (const alert of alerts) {
      expect(alert.disclaimer.toLowerCase()).toContain("does not prove");
      expect(alert.confidence).toBeTruthy();
      expect(alert.dataSource).toBeTruthy();
      expect(alert.generatedAt).toBeTruthy();
    }
  });
});
