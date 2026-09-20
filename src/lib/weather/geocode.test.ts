import { describe, expect, it } from "vitest";
import { lookupFarmingArea, shouldAskFarmingArea, farmingAreaUniquelyImpliesCountry } from "./geocode";
import { resolveCoordinates } from "./provider";
import { buildMockHumidRainyForecast, splitRecentAndForecast } from "./get-forecast";
import { summarizeAgronomicWeather } from "@/lib/agronomy/agronomic-weather";

describe("farming area geocoding", () => {
  it("resolves Couva without using a silent Trinidad default for unknown places", () => {
    const couva = lookupFarmingArea("I'm farming in Couva");
    expect(couva?.farmingArea).toBe("Couva");
    expect(couva?.country).toBe("Trinidad and Tobago");
    expect(lookupFarmingArea("My celery is burning")).toBeNull();
    expect(farmingAreaUniquelyImpliesCountry("Couva")).toBe("Trinidad and Tobago");
    expect(farmingAreaUniquelyImpliesCountry("Berbice")).toBe("Guyana");
    expect(farmingAreaUniquelyImpliesCountry("unknown village")).toBeNull();
  });

  it("resolves Berbice as Guyana, not Trinidad", () => {
    const area = lookupFarmingArea("leaf spots in Berbice");
    expect(area?.country).toBe("Guyana");
    expect(area?.farmingArea).toBe("Berbice");
    const coords = resolveCoordinates({
      country: area!.country!,
      district: area!.farmingArea,
      coordinates: area!.coordinates,
    });
    expect(coords.latitude).toBeCloseTo(6.248, 1);
  });

  it("asks for farming area when weather is needed and the area is unknown", () => {
    expect(
      shouldAskFarmingArea({
        country: "Guyana",
        weatherNeeded: true,
      }),
    ).toBe(true);
    expect(
      shouldAskFarmingArea({
        country: "Grenada",
        farmingArea: "St George",
        weatherNeeded: true,
      }),
    ).toBe(false);
    expect(
      shouldAskFarmingArea({
        country: "Grenada",
        weatherNeeded: false,
      }),
    ).toBe(false);
  });
});

describe("recent and forecast weather", () => {
  it("turns wet recent weather into agronomic meaning, not a local colour comment", () => {
    const forecast = buildMockHumidRainyForecast({
      country: "Trinidad and Tobago",
      district: "Couva",
    });
    expect(forecast.recentDaily?.length).toBeGreaterThanOrEqual(7);
    expect(forecast.forecastDaily?.length).toBeGreaterThanOrEqual(3);
    const summary = summarizeAgronomicWeather(forecast);
    expect(summary.signals.length).toBeGreaterThan(0);
    expect(summary.farmerBrief?.toLowerCase()).toMatch(
      /wet|rain|disease|heat|dry|spray/,
    );
    expect(summary.recentRainfallLabel).toMatch(/mm/);
  });

  it("splits past days from the forecast", () => {
    const split = splitRecentAndForecast(
      [
        { forecastDate: "2026-09-01", temperatureMaxC: 30, temperatureMinC: 24, rainfallMm: 12, precipitationProbabilityPct: 80, relativeHumidityMaxPct: 90 },
        { forecastDate: "2026-09-20", temperatureMaxC: 31, temperatureMinC: 24, rainfallMm: 4, precipitationProbabilityPct: 40, relativeHumidityMaxPct: 85 },
        { forecastDate: "2026-09-21", temperatureMaxC: 32, temperatureMinC: 25, rainfallMm: 10, precipitationProbabilityPct: 70, relativeHumidityMaxPct: 88 },
      ],
      "2026-09-20T12:00:00.000Z",
    );
    expect(split.recentDaily).toHaveLength(1);
    expect(split.forecastDaily.map((day) => day.forecastDate)).toEqual([
      "2026-09-20",
      "2026-09-21",
    ]);
  });
});
