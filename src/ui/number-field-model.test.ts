import { describe, expect, it } from "vitest";
import { sanitizeCode, sanitizeNumberText } from "./number-field-model";

describe("number field text", () => {
  it("keeps digits for integers", () => {
    expect(sanitizeNumberText("1a2.5-")).toBe("125");
    expect(sanitizeNumberText("")).toBe("");
  });
  it("keeps a single decimal separator when allowed", () => {
    expect(sanitizeNumberText("1,5", true)).toBe("1.5");
    expect(sanitizeNumberText("1.2.3x", true)).toBe("1.23");
  });
  it("trims codes to length and drops separators from pasted text", () => {
    expect(sanitizeCode("123 456 789", 6)).toBe("123456");
    expect(sanitizeCode("12-3", 6)).toBe("123");
  });
});
