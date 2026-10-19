import { describe, expect, it } from "vitest";
import { isManagementSection, managementSections } from "./sections";

describe("management route identity", () => {
  it("recognizes the stewards route and its product label", () => {
    expect(isManagementSection("stewards")).toBe(true);
    expect(managementSections.stewards).toEqual(["Proje sorumluları", "Project stewards"]);
  });
  it("does not treat unknown or inherited object names as sections", () => {
    for (const value of ["", "missing", "toString", "constructor", "__proto__"])
      expect(isManagementSection(value)).toBe(false);
  });
});
