import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { farmerRenderedAnswer } from "@/lib/chat/visible-reply";
import { resolveIdentityFromRequest } from "@/lib/beta/auth-server";
import { loadRegisteredFarmerContext } from "@/lib/beta/farmer-profile-context";
import type { AppIdentity } from "@/lib/beta/identity";
import { resetUsageStore } from "@/lib/beta/usage-store";
import { createFakeCaseSupabase } from "@/lib/cases/fake-supabase";
import {
  resetCaseStore,
  setCasePersistenceModeForTests,
  setCaseStoreAdminClientForTests,
} from "@/lib/cases/store";
import { resetRateLimitStore } from "@/lib/security/rate-limit";
import { setWeatherProviderForTests } from "@/lib/weather/get-forecast";
import type { WeatherForecast } from "@/lib/weather/provider";
import type { AgronomicCasePayload } from "@/lib/agronomy/case-schema";

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    connection: vi.fn(async () => undefined),
  };
});

vi.mock("@/lib/beta/auth-server", () => ({
  resolveIdentityFromRequest: vi.fn(),
}));

vi.mock("@/lib/beta/farmer-profile-context", () => ({
  loadRegisteredFarmerContext: vi.fn(async () => null),
}));

vi.mock("@/lib/openai/client", () => ({
  tryCreateOpenAIClient: vi.fn(() => ({
    ok: true,
    client: {
      responses: {
        create: vi.fn(async () => ({
          id: "resp_http_couva",
          model: "gpt-4o",
          output_text: JSON.stringify({
            observations: {
              crop: "sweet pepper",
              symptoms: ["curling", "yellowing"],
              lesionsReported: false,
              insectsReported: false,
              mosaicReported: false,
              wetOrDrainageReported: false,
            },
            admittedCauseIds: ["CERCOSPORA", "BACTERIAL_LEAF_SPOT", "FUNGAL_LEAF_SPOT", "APHIDS"],
            reasoningPerCause: [
              {
                causeId: "CERCOSPORA",
                why: "Pale-centred Cercospora / frogeye leaf spot after rain.",
              },
              {
                causeId: "BACTERIAL_LEAF_SPOT",
                why: "Greasy water-soaked lesions fit bacterial leaf spot.",
              },
              {
                causeId: "APHIDS",
                why: "Curling and yellowing can start with sucking insects under new leaves.",
              },
            ],
            checks: [
              "Are spots round with a pale centre, or greasy and water-soaked?",
              "Look for fungal vs bacterial leaf spots",
            ],
            immediateActions: [
              "If a spray is needed, use Mancozeb- or chlorothalonil-class protectants",
              "Copper spray classes for bacterial leaf spot",
              "Gently wash the leaves with water to remove any potential mites or aphids.",
              "Ensure balanced nutrition, particularly nitrogen and magnesium.",
              "Do not add extra fertilizer yet until we know whether older or newer leaves are affected",
            ],
            nextQuestion: "Are the spots round with a pale centre, or greasy and water-soaked?",
            photoRequest: false,
          }),
        })),
      },
    },
  })),
}));

const GUEST_ID = "11111111-1111-4111-8111-111111111111";
const COUVA =
  "My sweet pepper plants in Couva have some leaves curling and yellowing. It started a few days ago.";
const FORBIDDEN =
  /cercospora|frogeye|bacterial leaf spot|fungal leaf spot|pale[- ]centr|greasy|water[\s-]?soaked|mancozeb|chlorothalonil|copper spray|if a spray is needed/i;

function guestIdentity(): AppIdentity {
  return {
    kind: "guest",
    guestSessionId: GUEST_ID,
    authUserId: null,
    farmerProfileId: null,
    email: null,
    access: "guest",
  };
}

function dryForecast(): WeatherForecast {
  return {
    provider: "mock-dry",
    location: {
      country: "Trinidad and Tobago",
      district: "Couva",
      resolvedLatitude: 10.42,
      resolvedLongitude: -61.45,
    },
    retrievedAt: new Date().toISOString(),
    forecastHorizonHours: 72,
    current: {
      observedAt: new Date().toISOString(),
      temperatureC: 29,
      relativeHumidityPct: 55,
      rainfallMm: 0,
      precipitationProbabilityPct: 10,
      windSpeedMps: 3,
      dewPointC: 18,
    },
    hourly: [],
    daily: [],
    recentDaily: [],
    forecastDaily: [],
    consecutiveWetOrHumidHours: 0,
    estimatedLeafWetnessRisk: "low",
  };
}

describe("POST /api/ai/case Couva HTTP integration", () => {
  const fake = createFakeCaseSupabase();
  const env = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, env);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.OPENAI_API_KEY = "sk-test-key-not-a-placeholder";
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_GIT_COMMIT_SHA = "deadbeefcafebabe";
    process.env.VERCEL_GIT_COMMIT_REF = "cursor/crop-health-reasoning-89f1";
    fake.reset();
    resetCaseStore();
    resetUsageStore();
    resetRateLimitStore();
    setCaseStoreAdminClientForTests(fake);
    setCasePersistenceModeForTests("supabase");
    setWeatherProviderForTests({
      name: "mock-dry",
      getForecast: async () => dryForecast(),
    });
    vi.mocked(resolveIdentityFromRequest).mockResolvedValue(guestIdentity());
    vi.mocked(loadRegisteredFarmerContext).mockResolvedValue(null);
  });

  afterEach(() => {
    setCasePersistenceModeForTests(null);
    setCaseStoreAdminClientForTests(null);
    setWeatherProviderForTests(null);
    Object.assign(process.env, env);
    for (const key of Object.keys(process.env)) {
      if (!(key in env)) delete process.env[key];
    }
  });

  it("returns FarmerCaseChat JSON without ungated lesion diagnoses", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/ai/case", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-fvm-debug": "1",
        },
        body: JSON.stringify({
          message: COUVA,
          profile: { country: "Trinidad and Tobago", district: "Couva" },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-fvm-build-sha")).toBe("deadbeefcafebabe");

    const body = (await response.json()) as {
      case: AgronomicCasePayload | null;
      causeDebug?: {
        observations?: { symptoms?: string[] };
        allowedCauseIds?: string[];
        admittedCauseIds?: string[];
      };
      build?: { sha?: string | null; shortSha?: string | null; vercelEnv?: string | null };
    };

    expect(body.case).toBeTruthy();
    if (!body.case) return;

    expect(body.build?.sha).toBe("deadbeefcafebabe");
    expect(body.build?.shortSha).toBe("deadbee");
    expect(body.build?.vercelEnv).toBe("preview");

    const visible = farmerRenderedAnswer(body.case);
    expect(visible).toMatch(/curl|yellow/i);
    expect(visible).not.toMatch(FORBIDDEN);
    expect(JSON.stringify(body.case)).not.toMatch(FORBIDDEN);
    expect(JSON.stringify(body)).not.toMatch(FORBIDDEN);

    const allowed = body.case.allowedCauseIds ?? body.causeDebug?.allowedCauseIds ?? [];
    const admitted = body.case.admittedCauseIds ?? body.causeDebug?.admittedCauseIds ?? [];
    expect(allowed.join(" ")).not.toMatch(/CERCOSPORA|BACTERIAL_LEAF_SPOT|FUNGAL_LEAF_SPOT/);
    expect(admitted.join(" ")).not.toMatch(/CERCOSPORA|BACTERIAL_LEAF_SPOT|FUNGAL_LEAF_SPOT/);
    expect(admitted.join(" ")).toMatch(/APHIDS|NUTRIENT_PATTERN|MITES/);
    expect(body.case.nextQuestion.toLowerCase()).toMatch(/underside of the curled new leaves/);
    expect(body.case.nextQuestion.toLowerCase()).toMatch(/tiny insects|mites|webbing|cast skins|sticky residue/);
    expect((body.case.nextQuestion.match(/\?/g) ?? []).length).toBe(1);
    expect(body.case.sprayGuidanceText).toBeFalsy();
    const visibleLower = visible.toLowerCase();
    expect(visibleLower).not.toMatch(/wash the leaves|ensure balanced nutrition|nitrogen and magnesium/);
    expect((visibleLower.match(/do not add extra fertilizer/g) ?? []).length).toBeLessThanOrEqual(1);
    expect(body.causeDebug?.observations?.symptoms?.join(" ").toLowerCase()).toMatch(/curl|yellow/);
    expect(body.causeDebug?.observations?.symptoms?.join(" ").toLowerCase()).not.toMatch(/\bspots?\b/);
  });
});
