import { expect, it } from "vitest";
import { choiceKey, providerChoices, selectedChoice } from "./provider-choices";

const accounts = {
  claude: [
    { id: "default", label: "Host default", color: "hsl(1 1% 1%)" },
    { id: "account-a", label: "Claude account 1", color: "hsl(2 2% 2%)" },
    { id: "account-b", label: "Claude account 2", color: "hsl(3 3% 3%)" },
  ],
  codex: [{ id: "default", label: "Host default", color: "hsl(4 4% 4%)" }],
};

it("expands multi-account providers and keeps single-login providers as one choice", () => {
  const choices = providerChoices(["claude", "codex", "grok"], accounts, "Default account");
  expect(choices.map((choice) => [choice.key, choice.label, choice.detail])).toEqual([
    ["claude:", "Default account", "Claude"],
    ["claude:account-a", "Claude account 1", "Claude"],
    ["claude:account-b", "Claude account 2", "Claude"],
    ["codex:", "Codex", undefined],
    ["grok:", "Grok", undefined],
  ]);
  expect(choices[1]).toMatchObject({ accountId: "account-a", color: "hsl(2 2% 2%)" });
  expect(choices[0].accountId).toBeUndefined();
});

it("selects by provider and account, then falls back safely", () => {
  const choices = providerChoices(["claude", "codex"], accounts, "Default");
  expect(selectedChoice(choices, "claude", "account-b")?.label).toBe("Claude account 2");
  expect(selectedChoice(choices, "claude", "gone")?.key).toBe("claude:");
  expect(selectedChoice(choices, undefined, undefined)?.key).toBe("claude:");
  expect(choiceKey("claude", "default")).toBe("claude:");
});
