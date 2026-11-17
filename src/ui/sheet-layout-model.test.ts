import { describe, expect, it } from "vitest";
import { sheetCardMaxHeight, sheetPresentation } from "./sheet-layout-model";

describe("sheetPresentation", () => {
  it("floats non-full sheets on tablets only", () => {
    expect(sheetPresentation(true, false)).toBe("card");
    expect(sheetPresentation(false, false)).toBe("bottom");
    expect(sheetPresentation(true, true)).toBe("full");
    expect(sheetPresentation(false, true)).toBe("full");
  });
});

describe("sheetCardMaxHeight", () => {
  it("caps at 85% of the window", () => {
    expect(sheetCardMaxHeight(1000, 1000, 16)).toBe(850);
  });
  it("shrinks with the keyboard-reduced frame", () => {
    expect(sheetCardMaxHeight(1000, 500, 16)).toBe(468);
    expect(sheetCardMaxHeight(1000, 10, 16)).toBe(0);
  });
});
