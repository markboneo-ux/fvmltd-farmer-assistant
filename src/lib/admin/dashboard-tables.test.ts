import { describe, expect, it } from "vitest";
import { probeDashboardTables } from "./dashboard-tables";

describe("dashboard table probes", () => {
  it("reports missing optional insight tables without stopping later probes", async () => {
    const results = await probeDashboardTables({
      from(table: string) {
        return {
          select(columns: string) {
            return {
              limit: async () => {
                if (table === "crop_cases" || table === "case_messages") {
                  return { error: null };
                }
                if (table === "crop_checks" && columns.includes("farmer_profiles")) {
                  return {
                    error: {
                      message:
                        "Could not find a relationship between 'crop_checks' and 'farmer_profiles'",
                    },
                  };
                }
                if (table === "case_trends") {
                  return {
                    error: {
                      message:
                        "Could not find the table 'public.case_trends' in the schema cache",
                    },
                  };
                }
                return { error: null };
              },
            };
          },
        };
      },
    });
    const byTable = Object.fromEntries(results.map((row) => [row.table, row]));
    expect(byTable.crop_cases?.ok).toBe(true);
    expect(byTable.case_trends?.ok).toBe(false);
    expect(byTable.case_trends?.errorClass).toBe("missing_table");
    expect(byTable.crop_checks_queue?.ok).toBe(false);
    expect(byTable.crop_checks_queue?.errorClass).toBe("missing_table");
  });
});
