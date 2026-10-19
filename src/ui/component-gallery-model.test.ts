import { describe, expect, it } from "vitest";
import { componentCatalog } from "./catalog";
import { filterGalleryCatalog, galleryExampleFor, galleryGroups } from "./component-gallery-model";

describe("PanelUI gallery inventory", () => {
  it("keeps every installed component discoverable", () => {
    expect(filterGalleryCatalog()).toEqual(componentCatalog);
    expect(new Set(galleryGroups)).toEqual(new Set(componentCatalog.map((item) => item.group)));
  });
  it("combines case-insensitive search, category and priority filters", () => {
    expect(
      filterGalleryCatalog({ search: "  ATTACHMENT chat ", group: "chat", coreOnly: true }).map(
        (item) => item.id,
      ),
    ).toEqual(["attachment"]);
    expect(filterGalleryCatalog({ search: "attachment", group: "forms" })).toEqual([]);
  });
  it("keeps optional capability requirements in filtered results", () => {
    expect(
      filterGalleryCatalog({ search: "map" }).some(
        (item) => item.capability === "optional-native-map",
      ),
    ).toBe(true);
    expect(filterGalleryCatalog({ search: "support" })[0]?.capability).toBe(
      "requires-explicit-service-setup",
    );
  });
  it("only links modules with real interactive samples", () => {
    expect(galleryExampleFor("attachment")).toBe("chat");
    expect(galleryExampleFor("checkbox")).toBe("controls");
    expect(galleryExampleFor("timeline")).toBe("data");
    expect(galleryExampleFor("map")).toBeUndefined();
    expect(galleryExampleFor("support")).toBeUndefined();
  });
});
