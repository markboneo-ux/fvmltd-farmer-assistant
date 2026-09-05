import { beforeEach, describe, expect, it, vi } from "vitest";
import { tryCreateAdminClient } from "@/lib/supabase/helpers";
import { loadRegisteredFarmerContext } from "./farmer-profile-context";

vi.mock("@/lib/supabase/helpers", () => ({
  tryCreateAdminClient: vi.fn(),
}));

describe("loadRegisteredFarmerContext", () => {
  beforeEach(() => {
    vi.mocked(tryCreateAdminClient).mockReset();
  });

  it("returns null for guests", async () => {
    expect(await loadRegisteredFarmerContext(null)).toBeNull();
    expect(tryCreateAdminClient).not.toHaveBeenCalled();
  });

  it("reads country and district from the farmer profile", async () => {
    vi.mocked(tryCreateAdminClient).mockReturnValue({
      ok: true,
      client: {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  country: "Guyana",
                  region: "East Berbice-Corentyne",
                  district: "Berbice",
                  primary_crops: ["celery", "tomato"],
                },
                error: null,
              }),
            }),
          }),
        }),
      },
    } as never);

    await expect(
      loadRegisteredFarmerContext("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    ).resolves.toEqual({
      country: "Guyana",
      district: "Berbice",
      primaryCrops: ["celery", "tomato"],
    });
  });
});
