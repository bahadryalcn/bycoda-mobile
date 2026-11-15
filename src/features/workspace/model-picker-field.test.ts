import { createElement as h, type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children), Text: ({ children }: PropsWithChildren) => h("span", null, children) }));
vi.mock("@/ui/primitives", () => ({ Body: ({ children }: PropsWithChildren) => h("span", null, children), PressableCard: ({ children, label }: PropsWithChildren<{ label: string }>) => h("button", { "aria-label": label }, children) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/disclosure-motion", () => ({ DisclosureChevron: () => null }));
vi.mock("@/ui/provider-account-kind", () => ({ ProviderAccountKind: () => h("span", null, "Work") }));
vi.mock("@/ui/agent-avatar", () => ({ ProviderAccountMark: ({ provider, color }: { provider: string; color?: string }) => h("i", { "data-provider": provider, "data-account-color": color }) }));
vi.mock("./model-picker", () => ({ ModelPicker: () => null }));
import { ModelPickerField } from "./model-picker-field";

it("shows model and provider/account identity without the work/personal badge in new-session fields", () => {
  const choice = { key: "codex:default", provider: "codex" as const, label: "Host default", detail: "Codex", kind: "work" as const, color: "account-color" };
  const html = renderToStaticMarkup(h(ModelPickerField, { choices: [choice], choice, models: [], model: "GPT-6.1-Sol", settings: {}, onChooseProvider: vi.fn(), onChange: vi.fn() }));
  expect(html).toContain("GPT-6.1-Sol");
  expect(html).toContain("Host default · Codex");
  expect(html).toContain('data-provider="codex"');
  expect(html).toContain('data-account-color="account-color"');
  expect(html).not.toContain("Work");
});
