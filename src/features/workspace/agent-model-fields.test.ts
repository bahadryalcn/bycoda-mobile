// @vitest-environment jsdom
import { act, createElement, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AgentModelFields } from "./agent-model-fields";
import { sessionCatalog } from "./catalog";

vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./agent-option-icons", () => ({ SettingIcon: () => null }));
vi.mock("./model-picker-field", () => ({ ModelPickerField: () => null }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/ui/tokens", () => ({ space: {} }));
vi.mock("@/ui/primitives", () => ({
  SectionHeader: ({ title }: { title: string }) => createElement("h3", null, title),
  Body: ({ children }: PropsWithChildren) => createElement("span", null, children),
  Disclosure: ({ label, children }: PropsWithChildren<{ label: string }>) => createElement("details", null, createElement("summary", null, label), children),
  IdentifierField: ({ label, value, editable, onChangeText }: { label: string; value: string; editable: boolean; onChangeText(value: string): void }) => createElement("input", { "aria-label": label, value, disabled: !editable, onChange: (event) => onChangeText(event.currentTarget.value) }),
  SelectField: ({ label, value, options, disabled, onChange }: { label: string; value: string; options: { value: string; label: string }[]; disabled: boolean; onChange(value: string): void }) => createElement("select", { "aria-label": label, value, disabled, onChange: (event: import("react").ChangeEvent<HTMLSelectElement>) => onChange(event.currentTarget.value) }, options.map((option) => createElement("option", { value: option.value, key: option.value }, option.label))),
}));
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
let changedSettings: Record<string, string> | undefined;
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function render(provider: "claude" | "codex", disabled = false, options: { model?: string; settings?: Record<string, string>; sparseSettings?: boolean; unavailableAccount?: boolean } = {}) {
  changedSettings = undefined;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const models = sessionCatalog(undefined, [provider]).models[provider]!;
  function Form() {
    const [model, setModel] = useState(options.model ?? models[0].id);
    const [settings, setSettings] = useState<Record<string, string>>(options.settings ?? {});
    return createElement(AgentModelFields, { models, model, settings, disabled, sparseSettings: options.sparseSettings, unavailableAccount: options.unavailableAccount, onChange: (next, values) => { changedSettings = values; setModel(next); setSettings(values); } });
  }
  root = createRoot(container);
  await act(async () => root.render(createElement(Form)));
}
it("shows a named Codex model and reasoning immediately, and keeps effort changes", async () => {
  await render("codex");
  expect(container.querySelector('select[aria-label="Model"]')?.textContent).toContain("GPT");
  const reasoning = container.querySelector<HTMLSelectElement>('select[aria-label="Reasoning"]')!;
  expect(reasoning.value).toBe("low");
  await act(async () => { reasoning.value = "high"; reasoning.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(reasoning.value).toBe("high");
  expect(container.querySelector('select[aria-label="Service Tier"]')).not.toBeNull();
});

const reserved = { crossSubagents: "auto", crossAdvisor: "null", crossSubagentMaxEffort: "high", crewTools: "[]" };
it.each([false, true])("shows a saved model without an ID editor and retains independent settings on selection (sparse %s)", async sparseSettings => {
  const saved = "openrouter/anthropic:claude-sonnet-custom";
  await render("claude", false, { model: saved, settings: reserved, sparseSettings });
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Model"]')!;
  expect(select.value).toBe(saved);
  expect(container.querySelector("input")).toBeNull();
  expect(changedSettings).toBeUndefined();
  await act(async () => { select.value = "claude:haiku-4.5"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(changedSettings).toMatchObject(reserved);
});

it("keeps independent delegation and tool restrictions when a catalog model changes", async () => {
  await render("claude", false, { settings: reserved });
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Model"]')!;
  await act(async () => { select.value = "claude:haiku-4.5"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(changedSettings).toMatchObject(reserved);
});

it("locks every model control when its saved account is unavailable", async () => {
  await render("codex", false, { unavailableAccount: true });
  expect([...container.querySelectorAll<HTMLSelectElement | HTMLInputElement>("select,input")].every(element => element.disabled)).toBe(true);
});
it("updates Claude capabilities when switching from Fable to Haiku", async () => {
  await render("claude");
  expect(container.querySelector('select[aria-label="Reasoning"]')).not.toBeNull();
  const model = container.querySelector<HTMLSelectElement>('select[aria-label="Model"]')!;
  await act(async () => { model.value = "claude:haiku-4.5"; model.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(container.querySelector('select[aria-label="Reasoning"]')).toBeNull();
  expect(container.querySelector('select[aria-label="Thinking"]')).not.toBeNull();
  // The native id is not repeated under the model name.
  expect(container.textContent).not.toContain("claude-haiku-4-5");
});
it("locks model and reasoning while a session configuration is busy", async () => {
  await render("codex", true);
  expect([...container.querySelectorAll<HTMLSelectElement | HTMLInputElement>("select,input")].every((element) => element.disabled)).toBe(true);
});
it("leads with Model, Reasoning and Fast, then the Context and Advisor groups", async () => {
  await render("codex");
  const codex = [...container.querySelectorAll("select")].map((select) => select.getAttribute("aria-label"));
  expect(codex.slice(0, 3)).toEqual(["Model", "Reasoning", "Service Tier"]);
  await act(async () => root.unmount());
  container.replaceChildren();
  await render("claude");
  const claude = [...container.querySelectorAll("select")].map((select) => select.getAttribute("aria-label"));
  expect(claude.slice(0, 2)).toEqual(["Model", "Reasoning"]);
  const text = container.textContent ?? "";
  expect(text.indexOf("Context")).toBeGreaterThan(-1);
  expect(text.indexOf("Context")).toBeLessThan(text.indexOf("Advisor and subagents"));
});
