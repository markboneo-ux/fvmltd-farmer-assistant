import { describe, expect, it } from "vitest";
import { FARMER_PERSISTENCE_DEGRADED } from "@/lib/beta/limits";
import { farmerPersistenceBanner } from "./persistence-warning";

describe("farmer persistence banner", () => {
  it("does not warn when the chat saved", () => {
    expect(
      farmerPersistenceBanner({
        persistenceFailed: false,
        caseId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBeNull();
    expect(
      farmerPersistenceBanner({
        caseId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBeNull();
  });

  it("does not warn on a false persistenceFailed flag when a caseId was returned", () => {
    expect(
      farmerPersistenceBanner({
        persistenceFailed: true,
        caseId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBeNull();
  });

  it("warns only when the answer exists but the chat was not saved", () => {
    expect(
      farmerPersistenceBanner({
        persistenceFailed: true,
        caseId: null,
      }),
    ).toBe(FARMER_PERSISTENCE_DEGRADED);
  });
});
