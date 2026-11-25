import { expect, it } from "vitest";
import { accountName, choiceKey, providerChoices, providerName, selectedChoice } from "./provider-choices";

const accounts = {
  claude: [
    { id: "default", label: "Host default", color: "hsl(1 1% 1%)" },
    { id: "account-a", label: "Claude account 1", color: "hsl(2 2% 2%)" },
    { id: "account-b", label: "Claude account 2", color: "hsl(3 3% 3%)" },
  ],
  codex: [{ id: "default", label: "Host default", color: "hsl(4 4% 4%)" }],
};

it("uses brand spelling for provider labels and preserves unknown provider identities", () => {
  expect(["codex", "claude", "opencode", "antigravity"].map(providerName)).toEqual(["Codex", "Claude", "OpenCode", "Antigravity"]);
  expect(providerName("custom-acp-agent")).toBe("custom-acp-agent");
  expect(providerName("constructor")).toBe("constructor");
  expect(providerName("__proto__")).toBe("__proto__");
});

it("expands multi-account providers and keeps single-login providers as one choice", () => {
  const choices = providerChoices(["claude", "codex", "grok"], accounts, "Default account");
  expect(choices.map((choice) => [choice.key, choice.label, choice.detail])).toEqual([
    ["claude:", "Default account", "Claude"],
    ["claude:account-a", "Claude account 1", "Claude"],
    ["claude:account-b", "Claude account 2", "Claude"],
    ["codex:", "Default account", "Codex"],
    ["grok:", "Grok", undefined],
  ]);
  expect(choices[1]).toMatchObject({ accountId: "account-a", color: "hsl(2 2% 2%)" });
  expect(choices[0].accountId).toBeUndefined();
});
it("retains the actual identity of a single named account", () => {
  const choices = providerChoices(["claude"], { claude: [accounts.claude[1]!] }, "Default account");
  expect(choices[0]).toMatchObject({ key: "claude:account-a", accountId: "account-a", label: "Claude account 1" });
});
it("hides unavailable accounts and does not invent a default for an empty catalog", () => {
  expect(providerChoices(["claude"], { claude: [] }, "Default")).toEqual([]);
  expect(providerChoices(["claude"], { claude: [
    { id: "default", label: "Default", status: "signed-out" },
    { id: "work", label: "Work", status: "ready" },
    { id: "other", label: "Other", status: "unknown" },
  ] }, "Default").map((choice) => choice.key)).toEqual(["claude:work"]);
  expect(providerChoices(["claude"], { claude: [
    { id: "default", label: "Default", status: "unknown" },
  ] }, "Default").map((choice) => choice.key)).toEqual(["claude:"]);
});
it("localizes the Host's generic default label and preserves a renamed default", () => {
  const generic = providerChoices(["codex"], { codex: [{ ...accounts.codex[0]!, label: "Default account" }] }, "Varsayılan hesap");
  expect(generic[0]?.label).toBe("Varsayılan hesap");
  expect(generic[0]?.accountId).toBeUndefined();
  // "Host default" is the Host's internal name for its default login.
  expect(providerChoices(["codex"], accounts, "Varsayılan hesap")[0]?.label).toBe("Varsayılan hesap");
  expect(providerChoices(["codex"], { codex: [{ ...accounts.codex[0]!, label: "Personal" }] }, "Varsayılan hesap")[0]?.label).toBe("Personal");
  // A named account is never renamed, even when its label looks generic.
  expect(accountName({ id: "w", label: "Default" }, "Varsayılan hesap")).toBe("Default");
});

it("selects by provider and account, then falls back safely", () => {
  const choices = providerChoices(["claude", "codex"], accounts, "Default");
  expect(selectedChoice(choices, "claude", "account-b")?.label).toBe("Claude account 2");
  expect(selectedChoice(choices, "claude", "gone")?.key).toBe("claude:");
  expect(selectedChoice(choices, undefined, undefined)?.key).toBe("claude:");
  expect(choiceKey("claude", "default")).toBe("claude:");
});
