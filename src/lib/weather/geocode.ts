/**
 * Resolve a farmer's spoken farming area to coordinates.
 * Never silently default to Trinidad and Tobago.
 */

import type { WeatherCoordinates } from "./provider";
import { ASK_FARMING_AREA_QUESTION as AREA_QUESTION } from "@/lib/assistant/farmer-context";

export const ASK_FARMING_AREA_QUESTION = AREA_QUESTION;

export type GeocodedFarmingArea = {
  farmingArea: string;
  country: string | null;
  coordinates: WeatherCoordinates;
  source: "lookup" | "geocoder";
};

export type GeocodingProvider = {
  search(
    query: string,
    countryHint?: string | null,
  ): Promise<Array<{ name: string; country: string | null; coordinates: WeatherCoordinates }>>;
};

const CARIBBEAN_LAT = { min: 4, max: 28 };
const CARIBBEAN_LON = { min: -90, max: -54 };

/** Large land masses where a country centroid is too coarse for weather. */
export const AREA_SENSITIVE_COUNTRIES = [
  "guyana",
  "jamaica",
  "belize",
  "suriname",
  "haiti",
  "dominican republic",
];

type AreaEntry = {
  aliases: string[];
  label: string;
  country: string;
  coordinates: WeatherCoordinates;
};

const AREAS: AreaEntry[] = [
  { aliases: ["couva"], label: "Couva", country: "Trinidad and Tobago", coordinates: { latitude: 10.422, longitude: -61.45 } },
  { aliases: ["chaguanas", "cunupia"], label: "Chaguanas", country: "Trinidad and Tobago", coordinates: { latitude: 10.5167, longitude: -61.4167 } },
  { aliases: ["arima"], label: "Arima", country: "Trinidad and Tobago", coordinates: { latitude: 10.6333, longitude: -61.2833 } },
  { aliases: ["san fernando"], label: "San Fernando", country: "Trinidad and Tobago", coordinates: { latitude: 10.2833, longitude: -61.4667 } },
  { aliases: ["port of spain"], label: "Port of Spain", country: "Trinidad and Tobago", coordinates: { latitude: 10.6549, longitude: -61.5019 } },
  { aliases: ["sangre grande"], label: "Sangre Grande", country: "Trinidad and Tobago", coordinates: { latitude: 10.5871, longitude: -61.1321 } },
  { aliases: ["point fortin"], label: "Point Fortin", country: "Trinidad and Tobago", coordinates: { latitude: 10.1667, longitude: -61.6833 } },
  { aliases: ["tunapuna", "st augustine", "piarco"], label: "Tunapuna", country: "Trinidad and Tobago", coordinates: { latitude: 10.652, longitude: -61.388 } },
  { aliases: ["penal"], label: "Penal", country: "Trinidad and Tobago", coordinates: { latitude: 10.166, longitude: -61.447 } },
  { aliases: ["debe"], label: "Debe", country: "Trinidad and Tobago", coordinates: { latitude: 10.2, longitude: -61.45 } },
  { aliases: ["princes town"], label: "Princes Town", country: "Trinidad and Tobago", coordinates: { latitude: 10.266, longitude: -61.383 } },
  { aliases: ["rio claro"], label: "Rio Claro", country: "Trinidad and Tobago", coordinates: { latitude: 10.306, longitude: -61.175 } },
  { aliases: ["mayaro"], label: "Mayaro", country: "Trinidad and Tobago", coordinates: { latitude: 10.3, longitude: -61.007 } },
  { aliases: ["siparia", "fyzabad"], label: "Siparia", country: "Trinidad and Tobago", coordinates: { latitude: 10.145, longitude: -61.507 } },
  { aliases: ["diego martin"], label: "Diego Martin", country: "Trinidad and Tobago", coordinates: { latitude: 10.721, longitude: -61.548 } },
  { aliases: ["toco"], label: "Toco", country: "Trinidad and Tobago", coordinates: { latitude: 10.833, longitude: -60.95 } },
  { aliases: ["cedros", "icacos"], label: "Cedros", country: "Trinidad and Tobago", coordinates: { latitude: 10.084, longitude: -61.96 } },
  { aliases: ["caroni", "freeport"], label: "Caroni", country: "Trinidad and Tobago", coordinates: { latitude: 10.45, longitude: -61.4 } },
  { aliases: ["tableland", "moruga"], label: "Tableland", country: "Trinidad and Tobago", coordinates: { latitude: 10.22, longitude: -61.3 } },
  { aliases: ["scarborough", "canaan", "tobago"], label: "Tobago", country: "Trinidad and Tobago", coordinates: { latitude: 11.181, longitude: -60.735 } },
  { aliases: ["central trinidad"], label: "Central Trinidad", country: "Trinidad and Tobago", coordinates: { latitude: 10.48, longitude: -61.4 } },
  { aliases: ["berbice", "new amsterdam", "rose hall", "skeldon"], label: "Berbice", country: "Guyana", coordinates: { latitude: 6.248, longitude: -57.517 } },
  { aliases: ["essequibo", "anna regina", "suddie", "charity"], label: "Essequibo", country: "Guyana", coordinates: { latitude: 7.264, longitude: -58.508 } },
  { aliases: ["demerara", "georgetown", "parika", "mahaica", "timehri"], label: "Demerara", country: "Guyana", coordinates: { latitude: 6.8013, longitude: -58.1551 } },
  { aliases: ["linden"], label: "Linden", country: "Guyana", coordinates: { latitude: 6.008, longitude: -58.307 } },
  { aliases: ["kingston"], label: "Kingston", country: "Jamaica", coordinates: { latitude: 18.0179, longitude: -76.8099 } },
  { aliases: ["montego bay", "st james"], label: "Montego Bay", country: "Jamaica", coordinates: { latitude: 18.4762, longitude: -77.8939 } },
  { aliases: ["st catherine", "saint catherine", "spanish town", "old harbour"], label: "St Catherine", country: "Jamaica", coordinates: { latitude: 17.996, longitude: -76.95 } },
  { aliases: ["clarendon", "may pen"], label: "Clarendon", country: "Jamaica", coordinates: { latitude: 17.97, longitude: -77.24 } },
  { aliases: ["st elizabeth", "saint elizabeth"], label: "St Elizabeth", country: "Jamaica", coordinates: { latitude: 18.05, longitude: -77.75 } },
  { aliases: ["manchester", "mandeville"], label: "Manchester", country: "Jamaica", coordinates: { latitude: 18.04, longitude: -77.5 } },
  { aliases: ["st ann", "ocho rios"], label: "St Ann", country: "Jamaica", coordinates: { latitude: 18.43, longitude: -77.2 } },
  { aliases: ["portland", "port antonio"], label: "Portland", country: "Jamaica", coordinates: { latitude: 18.18, longitude: -76.45 } },
  { aliases: ["westmoreland", "savanna-la-mar", "savanna la mar"], label: "Westmoreland", country: "Jamaica", coordinates: { latitude: 18.22, longitude: -78.13 } },
  { aliases: ["bridgetown", "christ church", "oistins"], label: "Christ Church", country: "Barbados", coordinates: { latitude: 13.1, longitude: -59.53 } },
  { aliases: ["st george barbados"], label: "St George", country: "Barbados", coordinates: { latitude: 13.14, longitude: -59.55 } },
  { aliases: ["st philip"], label: "St Philip", country: "Barbados", coordinates: { latitude: 13.12, longitude: -59.46 } },
  { aliases: ["speightstown", "st peter"], label: "Speightstown", country: "Barbados", coordinates: { latitude: 13.25, longitude: -59.64 } },
  { aliases: ["st george", "st george's", "st georges", "saint george"], label: "St George", country: "Grenada", coordinates: { latitude: 12.056, longitude: -61.748 } },
  { aliases: ["carriacou"], label: "Carriacou", country: "Grenada", coordinates: { latitude: 12.48, longitude: -61.45 } },
  { aliases: ["grenville", "st andrew"], label: "St Andrew", country: "Grenada", coordinates: { latitude: 12.12, longitude: -61.62 } },
  { aliases: ["castries"], label: "Castries", country: "Saint Lucia", coordinates: { latitude: 14.01, longitude: -60.987 } },
  { aliases: ["vieux fort"], label: "Vieux Fort", country: "Saint Lucia", coordinates: { latitude: 13.728, longitude: -60.949 } },
  { aliases: ["soufriere"], label: "Soufriere", country: "Saint Lucia", coordinates: { latitude: 13.856, longitude: -61.057 } },
  { aliases: ["gros islet"], label: "Gros Islet", country: "Saint Lucia", coordinates: { latitude: 14.081, longitude: -60.953 } },
  { aliases: ["kingstown"], label: "Kingstown", country: "Saint Vincent and the Grenadines", coordinates: { latitude: 13.16, longitude: -61.225 } },
  { aliases: ["st john's", "st johns", "saint john's"], label: "St John's", country: "Antigua and Barbuda", coordinates: { latitude: 17.127, longitude: -61.847 } },
  { aliases: ["roseau"], label: "Roseau", country: "Dominica", coordinates: { latitude: 15.301, longitude: -61.388 } },
  { aliases: ["basseterre"], label: "Basseterre", country: "Saint Kitts and Nevis", coordinates: { latitude: 17.295, longitude: -62.726 } },
  { aliases: ["belmopan", "orange walk", "corozal"], label: "Belmopan", country: "Belize", coordinates: { latitude: 17.251, longitude: -88.759 } },
  { aliases: ["nassau"], label: "Nassau", country: "The Bahamas", coordinates: { latitude: 25.044, longitude: -77.35 } },
  { aliases: ["paramaribo"], label: "Paramaribo", country: "Suriname", coordinates: { latitude: 5.852, longitude: -55.204 } },
  { aliases: ["cap-haitien", "cap haitien", "port-au-prince"], label: "Port-au-Prince", country: "Haiti", coordinates: { latitude: 18.594, longitude: -72.307 } },
];

let injectedGeocoder: GeocodingProvider | null = null;

export function setGeocodingProviderForTests(provider: GeocodingProvider | null) {
  injectedGeocoder = provider;
}

export function isAreaSensitiveCountry(country: string | null | undefined): boolean {
  const needle = (country ?? "").trim().toLowerCase();
  if (!needle) return true;
  return AREA_SENSITIVE_COUNTRIES.some(
    (name) => needle.includes(name) || name.includes(needle),
  );
}

export function inCaribbeanBounds(coords: WeatherCoordinates): boolean {
  return (
    coords.latitude >= CARIBBEAN_LAT.min &&
    coords.latitude <= CARIBBEAN_LAT.max &&
    coords.longitude >= CARIBBEAN_LON.min &&
    coords.longitude <= CARIBBEAN_LON.max
  );
}

export function lookupFarmingArea(
  text: string,
  countryHint?: string | null,
): GeocodedFarmingArea | null {
  const lower = text.trim().toLowerCase();
  if (!lower) return null;
  const hint = (countryHint ?? "").trim().toLowerCase();
  let best: AreaEntry | null = null;
  let bestIndex = Number.POSITIVE_INFINITY;

  for (const area of AREAS) {
    if (hint && !area.country.toLowerCase().includes(hint) && !hint.includes(area.country.toLowerCase())) {
      // Keep unmatched-country aliases only when the text itself names that country.
      if (!lower.includes(area.country.toLowerCase().split(" ")[0] ?? "")) {
        continue;
      }
    }
    for (const alias of area.aliases) {
      const index = lower.indexOf(alias);
      if (index >= 0 && index < bestIndex) {
        best = area;
        bestIndex = index;
      }
    }
  }

  if (!best) return null;
  return {
    farmingArea: best.label,
    country: best.country,
    coordinates: best.coordinates,
    source: "lookup",
  };
}

export class OpenMeteoGeocodingProvider implements GeocodingProvider {
  async search(
    query: string,
    countryHint?: string | null,
  ): Promise<Array<{ name: string; country: string | null; coordinates: WeatherCoordinates }>> {
    const params = new URLSearchParams({
      name: query,
      count: "6",
      language: "en",
      format: "json",
    });
    const response = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) return [];
    const data = (await response.json()) as {
      results?: Array<{
        name?: string;
        country?: string;
        latitude?: number;
        longitude?: number;
      }>;
    };
    const hint = (countryHint ?? "").trim().toLowerCase();
    return (data.results ?? [])
      .map((row) => ({
        name: String(row.name ?? query),
        country: row.country ? String(row.country) : null,
        coordinates: {
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
        },
      }))
      .filter(
        (row) =>
          Number.isFinite(row.coordinates.latitude) &&
          Number.isFinite(row.coordinates.longitude) &&
          inCaribbeanBounds(row.coordinates) &&
          (!hint ||
            (row.country ?? "").toLowerCase().includes(hint) ||
            hint.includes((row.country ?? "").toLowerCase())),
      );
  }
}

function geocoder(): GeocodingProvider {
  return injectedGeocoder ?? new OpenMeteoGeocodingProvider();
}

/**
 * Resolve a spoken farming area to usable coordinates.
 * Lookup first; network geocoding only when needed.
 */
export async function resolveFarmingArea(options: {
  farmingArea?: string | null;
  country?: string | null;
  text?: string | null;
}): Promise<GeocodedFarmingArea | null> {
  const query = [options.farmingArea, options.text].filter(Boolean).join(" ").trim();
  if (!query) return null;

  const lookedUp = lookupFarmingArea(query, options.country);
  if (lookedUp) return lookedUp;
  if (options.farmingArea) {
    const areaOnly = lookupFarmingArea(options.farmingArea, options.country);
    if (areaOnly) return areaOnly;
  }

  try {
    const hits = await geocoder().search(
      options.farmingArea?.trim() || query,
      options.country,
    );
    const hit = hits[0];
    if (!hit) return null;
    return {
      farmingArea: options.farmingArea?.trim() || hit.name,
      country: hit.country || options.country || null,
      coordinates: hit.coordinates,
      source: "geocoder",
    };
  } catch {
    return null;
  }
}

export function shouldAskFarmingArea(options: {
  farmingArea?: string | null;
  district?: string | null;
  country?: string | null;
  weatherNeeded?: boolean;
  weatherIsCentral?: boolean;
}): boolean {
  if ((options.farmingArea ?? options.district ?? "").trim()) return false;
  if (!options.weatherNeeded && !options.weatherIsCentral) return false;
  if (options.weatherIsCentral) return true;
  if (!options.country?.trim()) return true;
  return isAreaSensitiveCountry(options.country);
}
