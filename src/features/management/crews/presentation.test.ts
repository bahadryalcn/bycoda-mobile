import { describe, expect, it } from "vitest";
import type { HostModelCatalog } from "@/domain/types";
import { crewCatalogState, crewRoleOptions } from "./presentation";

describe("crew read presentation", () => {
  const ready: HostModelCatalog = {
    models: { codex: [{ id: "model", name: "Model", harness: "codex", settings: [] }] },
    errors: {},
  };
  it("distinguishes initial and progressive loading from empty and failed discovery", () => {
    expect(crewCatalogState(undefined, null)).toBe("loading");
    expect(crewCatalogState({ models: {}, errors: {}, pending: ["codex"] }, null)).toBe("loading");
    expect(crewCatalogState({ models: {}, errors: {} }, null)).toBe("empty");
    expect(crewCatalogState({ models: {}, errors: { codex: "Unavailable" } }, null)).toBe("error");
    expect(crewCatalogState(undefined, new Error("Failed"))).toBe("error");
  });
  it("retains cached options during refresh or error without changing model/candidate data", () => {
    const original = JSON.stringify(ready);
    expect(crewCatalogState({ ...ready, pending: ["claude"] }, null)).toBe("ready");
    expect(crewCatalogState(ready, new Error("Refresh failed"))).toBe("error");
    expect(JSON.stringify(ready)).toBe(original);
  });
  it("keeps every canonical role value while sharing localized list and editor names", () => {
    const tr = crewRoleOptions((text) => text);
    const en = crewRoleOptions((_, text) => text);
    expect(tr.map((role) => role.value)).toEqual([
      "coordinator",
      "specialist",
      "reviewer",
      "advisor",
    ]);
    expect(en.map((role) => role.value)).toEqual(tr.map((role) => role.value));
    expect(tr.map((role) => role.label)).toEqual(["Koordinatör", "Uzman", "İnceleyen", "Danışman"]);
    expect(en.map((role) => role.label)).toEqual([
      "Coordinator",
      "Specialist",
      "Reviewer",
      "Advisor",
    ]);
  });
});
