import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { storedCountryForNewFarmer } from "./stored-country";
import { extractKnownFacts } from "@/lib/agronomy/tomato-protocol";
import { emptyFarmerContext, farmerContextFromText } from "@/lib/assistant/farmer-context";

describe("new farmer country defaults", () => {
  it("stores unknown, not Trinidad, when no country is selected", () => {
    expect(storedCountryForNewFarmer("")).toBeNull();
    expect(storedCountryForNewFarmer(undefined)).toBeNull();
    expect(storedCountryForNewFarmer("   ")).toBeNull();
    expect(storedCountryForNewFarmer("Guyana")).toBe("Guyana");
    expect(storedCountryForNewFarmer("Trinidad and Tobago")).toBe("Trinidad and Tobago");
  });

  it("does not infer Trinidad for a new farmer without country", () => {
    expect(emptyFarmerContext().country.value).toBeNull();
    expect(farmerContextFromText("My celery is burning up.").country.value).toBeNull();
    const facts = extractKnownFacts("My celery is burning up.");
    expect(facts.country).toBeNull();
    expect(facts.locationConfidence).toBe("unknown");
    expect(facts.country).not.toBe("Trinidad and Tobago");
  });

  it("drops the SQL default instead of assigning Trinidad to future rows", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260905180000_drop_farmer_country_trinidad_default.sql"),
      "utf8",
    );
    expect(sql).toMatch(/alter column country drop default/i);
    expect(sql).not.toMatch(/set default 'Trinidad and Tobago'/i);
    const registerForm = readFileSync(
      join(process.cwd(), "src/components/RegisterForm.tsx"),
      "utf8",
    );
    expect(registerForm).toMatch(/country:\s*""/);
    expect(registerForm).not.toMatch(/country:\s*DEFAULT_COUNTRY/);
  });
});
