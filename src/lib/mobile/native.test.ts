import { describe, expect, it } from "vitest";
import { isStaffOrAdminPath } from "@/lib/mobile/native";

describe("mobile farmer shell routing", () => {
  it("treats staff, admin, and ai-lab as non-farmer routes", () => {
    expect(isStaffOrAdminPath("/staff")).toBe(true);
    expect(isStaffOrAdminPath("/staff/login")).toBe(true);
    expect(isStaffOrAdminPath("/admin/insights")).toBe(true);
    expect(isStaffOrAdminPath("/ai-lab")).toBe(true);
  });

  it("keeps farmer routes available", () => {
    expect(isStaffOrAdminPath("/")).toBe(false);
    expect(isStaffOrAdminPath("/chat")).toBe(false);
    expect(isStaffOrAdminPath("/dashboard")).toBe(false);
    expect(isStaffOrAdminPath("/crop-check")).toBe(false);
    expect(isStaffOrAdminPath("/signin")).toBe(false);
  });
});
