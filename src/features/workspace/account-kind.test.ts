import { expect, it } from "vitest";
import { providerChoices } from "./provider-choices";
it("maps override and derived kind, and accepts older Host rows", () => {
  const choices = providerChoices(
    ["claude", "codex"],
    {
      claude: [{ id: "a", label: "Work", kind: "work", derivedKind: "personal" }],
      codex: [{ id: "default", label: "Legacy" }],
    },
    "Default",
  );
  expect(choices.find((c) => c.provider === "claude")).toMatchObject({
    kind: "work",
    derivedKind: "personal",
  });
  expect(choices.find((c) => c.provider === "codex")?.kind).toBeUndefined();
});
