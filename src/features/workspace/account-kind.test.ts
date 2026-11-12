import { expect, it } from "vitest";
import { providerChoices } from "./provider-choices";
import { validateAccountChange, decodeAccountDraft } from "../tools/provider-account-draft";
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
it("validates kind changes and preserves explicit Automatic in saved drafts", () => {
  for (const accountKind of ["personal", "work", null])
    expect(validateAccountChange({ kind: "accountKind", accountKind })).toEqual({
      kind: "accountKind",
      accountKind,
    });
  expect(() => validateAccountChange({ kind: "accountKind", accountKind: "admin" })).toThrow();
  expect(
    decodeAccountDraft(
      JSON.stringify({ kind: "accountKind", label: "A", color: null, accountKind: null }),
    ).accountKind,
  ).toBeNull();
  expect(
    decodeAccountDraft(JSON.stringify({ kind: "rename", label: "A", color: null })).accountKind,
  ).toBeUndefined();
});
