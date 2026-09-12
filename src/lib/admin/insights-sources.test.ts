import { afterEach, describe, expect, it } from "vitest";
import { CasePersistenceError } from "@/lib/cases/persistence";
import {
  getInsightsSourceFailures,
  loadInsightsSource,
  resetInsightsSourceFailures,
} from "./insights-sources";

describe("insights source isolation", () => {
  afterEach(() => {
    resetInsightsSourceFailures();
  });

  it("returns the fallback when an optional table fails and records the query error", async () => {
    const rows = await loadInsightsSource(
      "case_trends",
      async () => {
        throw new CasePersistenceError(
          "Could not find the table 'public.case_trends' in the schema cache",
          "case_trends",
        );
      },
      [],
    );
    expect(rows).toEqual([]);
    expect(getInsightsSourceFailures()).toEqual([
      {
        table: "case_trends",
        error: "Could not find the table 'public.case_trends' in the schema cache",
      },
    ]);
  });

  it("rethrows a required table failure after recording it", async () => {
    await expect(
      loadInsightsSource(
        "crop_cases",
        async () => {
          throw new CasePersistenceError("permission denied for table crop_cases", "crop_cases");
        },
        [],
        true,
      ),
    ).rejects.toBeInstanceOf(CasePersistenceError);
    expect(getInsightsSourceFailures()[0]?.table).toBe("crop_cases");
  });
});
