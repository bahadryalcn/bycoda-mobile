import { describe, expect, it } from "vitest";
import { disclosureAccessibleLabel } from "./disclosure-label";

describe("disclosure accessible name", () => {
  it("includes the collapsed summary so assistive tech hears what sighted users see", () => {
    expect(disclosureAccessibleLabel("Dosyalar", "3 dosya", false)).toBe("Dosyalar. 3 dosya");
  });

  it("drops the summary once expanded, matching its visual removal", () => {
    expect(disclosureAccessibleLabel("Dosyalar", "3 dosya", true)).toBe("Dosyalar");
  });

  it("is the bare label when there is no summary", () => {
    expect(disclosureAccessibleLabel("Dosyalar", undefined, false)).toBe("Dosyalar");
    expect(disclosureAccessibleLabel("Dosyalar", "", false)).toBe("Dosyalar");
  });
});
