import { describe, expect, it } from "vitest";
import type { HostModelCatalog } from "@/domain/types";
import { effectiveAgentModel, validAgentRunMinutes } from "./agent-model";

const catalog = {
  models: { codex: [{ id: "discovered-codex" }], claude: [{ id: "discovered-claude" }] },
  errors: {},
} as HostModelCatalog;
describe("effective agent model", () => {
  it("preserves saved and manually entered models across catalog changes", () => {
    expect(effectiveAgentModel("custom-id", "codex", catalog)).toBe("custom-id");
    expect(effectiveAgentModel("saved-id", "claude")).toBe("saved-id");
  });
  it("defaults only to a model actually reported for the selected harness", () => {
    expect(effectiveAgentModel("", "codex", catalog)).toBe("discovered-codex");
    expect(effectiveAgentModel("", "claude", catalog)).toBe("discovered-claude");
    expect(effectiveAgentModel("", "codex")).toBe("");
  });
});

it("accepts unlimited and bounded whole-minute run limits", () => {
  expect(["0", "1", "10080"].every(validAgentRunMinutes)).toBe(true);
  expect(["", "-1", "1.5", "10081"].some(validAgentRunMinutes)).toBe(false);
});
