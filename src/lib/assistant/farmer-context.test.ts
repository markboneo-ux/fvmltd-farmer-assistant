import { describe, expect, it } from "vitest";
import {
  ASK_COUNTRY_QUESTION,
  extractCountryName,
  extractRegionAndCountry,
  farmerContextFromText,
  inferFarmerLevel,
  mergeCaseProfileContext,
  shouldAskCountry,
  userLevelToFarmerLevel,
} from "./farmer-context";

describe("farmer country and region", () => {
  it("does not assume Trinidad when country is unknown", () => {
    const context = farmerContextFromText("My celery is burning up.");
    expect(context.country.value).toBeNull();
    expect(extractCountryName("My celery is burning up.")).toBeNull();
  });

  it("extracts Caribbean countries from natural speech", () => {
    expect(extractCountryName("I farm in Guyana")).toBe("Guyana");
    expect(extractCountryName("This is in Grenada")).toBe("Grenada");
    expect(extractCountryName("Saint Lucia market price")).toBe("Saint Lucia");
    expect(extractCountryName("Trinidad and Tobago celery")).toBe("Trinidad and Tobago");
    expect(extractCountryName("I'm in Trinidad. My celery is burning.")).toBe(
      "Trinidad and Tobago",
    );
  });

  it("uses region when it changes the location", () => {
    expect(extractRegionAndCountry("Central Trinidad celery")).toMatchObject({
      region: "Central Trinidad",
      country: "Trinidad and Tobago",
    });
    expect(extractRegionAndCountry("Berbice, Guyana")).toMatchObject({
      region: "Berbice",
      country: "Guyana",
    });
    expect(extractRegionAndCountry("St George, Grenada")).toMatchObject({
      region: "St George",
      country: "Grenada",
    });
  });

  it("uses the latest country mentioned, not the first", () => {
    expect(
      extractCountryName(
        "I used to farm in Trinidad and Tobago. Now I am in Guyana.",
      ),
    ).toBe("Guyana");
    expect(
      extractRegionAndCountry("Central Trinidad last year, now Berbice, Guyana"),
    ).toMatchObject({
      region: "Berbice",
      country: "Guyana",
    });
  });

  it("fills gaps from a stored profile without letting it override speech", () => {
    expect(
      mergeCaseProfileContext({
        client: { country: "", district: "" },
        continuing: null,
        registered: { country: "Guyana", district: "Berbice" },
      }),
    ).toEqual({
      country: "Guyana",
      district: "Berbice",
      countrySource: "registered",
      locationConfidence: "profile_confirmed",
    });
    expect(
      mergeCaseProfileContext({
        client: { country: "Jamaica", district: "" },
        continuing: { country: "Trinidad and Tobago", district: "Couva" },
        registered: { country: "Guyana", district: "Berbice" },
      }),
    ).toEqual({
      country: "Jamaica",
      district: "Couva",
      countrySource: "client",
      locationConfidence: "profile_confirmed",
    });
    expect(
      mergeCaseProfileContext({
        client: { country: "", district: "" },
        continuing: {
          country: "Trinidad and Tobago",
          district: "Couva",
          locationConfidence: "explicit",
        },
        registered: { country: "Guyana", district: "Berbice" },
      }),
    ).toEqual({
      country: "Trinidad and Tobago",
      district: "Couva",
      countrySource: "continuing",
      locationConfidence: "explicit",
    });
    expect(
      mergeCaseProfileContext({
        client: { country: "", district: "" },
        continuing: null,
        registered: { country: "Guyana", district: "Berbice" },
      }).country,
    ).toBe("Guyana");
    expect(
      mergeCaseProfileContext({
        client: { country: "", district: "" },
        continuing: null,
        registered: null,
      }),
    ).toEqual({
      country: null,
      district: null,
      countrySource: null,
      locationConfidence: "unknown",
    });
  });

  it("asks country only when local facts matter and country is unknown", () => {
    expect(
      shouldAskCountry({
        country: null,
        intent: "crop_problem",
      }),
    ).toBe(false);
    expect(
      shouldAskCountry({
        country: null,
        asksForProducts: true,
      }),
    ).toBe(true);
    expect(
      shouldAskCountry({
        country: "Trinidad and Tobago",
        asksForProducts: true,
      }),
    ).toBe(false);
    expect(ASK_COUNTRY_QUESTION).toMatch(/country/i);
  });
});

describe("farmer technical level", () => {
  it("classifies a home gardener from simple garden language", () => {
    expect(
      inferFarmerLevel("My backyard celery in pots on the porch is burning").level,
    ).toBe("HOME_GARDENER");
  });

  it("classifies a commercial farmer from acreage", () => {
    expect(
      inferFarmerLevel("I am a commercial farmer with 3 acres of celery").level,
    ).toBe("COMMERCIAL_FARMER");
  });

  it("classifies a technical user from FRAC/EC language", () => {
    expect(
      inferFarmerLevel(
        "Celery foliar necrosis. Differential for tip burn vs Cercospora. Check EC and FRAC if we spray.",
      ).level,
    ).toBe("TECHNICAL_USER");
  });

  it("classifies an agronomist from role language", () => {
    expect(inferFarmerLevel("I am an agronomist reviewing this case").level).toBe(
      "AGRONOMIST",
    );
  });

  it("maps stored user levels back to farmer levels", () => {
    expect(userLevelToFarmerLevel("home_gardener")).toBe("HOME_GARDENER");
    expect(userLevelToFarmerLevel("farmer")).toBe("SMALL_FARMER");
    expect(userLevelToFarmerLevel("technical_user")).toBe("TECHNICAL_USER");
  });
});
