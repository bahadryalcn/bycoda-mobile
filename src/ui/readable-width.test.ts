import { describe, expect, it } from "vitest";
import { tabRootColumn } from "./readable-width";

describe("tabRootColumn", () => {
  it("caps and centers only on tablets", () => {
    expect(tabRootColumn(false)).toEqual({ flex: 1 });
    expect(tabRootColumn(true)).toMatchObject({ maxWidth: 760, alignSelf: "center", width: "100%" });
  });
});
