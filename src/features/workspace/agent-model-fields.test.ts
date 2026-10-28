// @vitest-environment jsdom
import { act, createElement, useState, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { AgentModelFields } from "./agent-model-fields";
import { sessionCatalog } from "./catalog";

vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/primitives", () => ({
  Body: ({ children }: PropsWithChildren) => createElement("span", null, children),
  Disclosure: ({ label, children }: PropsWithChildren<{ label: string }>) => createElement("details", null, createElement("summary", null, label), children),
  IdentifierField: ({ label, value, editable, onChangeText }: { label: string; value: string; editable: boolean; onChangeText(value: string): void }) => createElement("input", { "aria-label": label, value, disabled: !editable, onChange: (event) => onChangeText(event.currentTarget.value) }),
  SelectField: ({ label, value, options, disabled, onChange }: { label: string; value: string; options: { value: string; label: string }[]; disabled: boolean; onChange(value: string): void }) => createElement("select", { "aria-label": label, value, disabled, onChange: (event: import("react").ChangeEvent<HTMLSelectElement>) => onChange(event.currentTarget.value) }, options.map((option) => createElement("option", { value: option.value, key: option.value }, option.label))),
}));
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });
async function render(provider: "claude" | "codex", disabled = false) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const models = sessionCatalog(undefined, [provider]).models[provider]!;
  function Form() {
    const [model, setModel] = useState(models[0].id);
    const [settings, setSettings] = useState<Record<string, string>>({});
    return createElement(AgentModelFields, { models, model, settings, disabled, onChange: (next, values) => { setModel(next); setSettings(values); } });
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
  expect(container.querySelector('select[aria-label="Speed"]')).not.toBeNull();
});
it("updates Claude capabilities when switching from Fable to Haiku", async () => {
  await render("claude");
  expect(container.querySelector('select[aria-label="Reasoning"]')).not.toBeNull();
  const model = container.querySelector<HTMLSelectElement>('select[aria-label="Model"]')!;
  await act(async () => { model.value = "claude:haiku-4.5"; model.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(container.querySelector('select[aria-label="Reasoning"]')).toBeNull();
  expect(container.querySelector('select[aria-label="Thinking"]')).not.toBeNull();
  expect(container.textContent).toContain("claude-haiku-4-5");
});
it("locks model, reasoning and custom ID while a session configuration is busy", async () => {
  await render("codex", true);
  expect([...container.querySelectorAll<HTMLSelectElement | HTMLInputElement>("select,input")].every((element) => element.disabled)).toBe(true);
});
