// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { GoalSettingsEditor } from "./goals/settings-editor";
import { ContentExcerpt } from "./social/content-excerpt";
import { CollectionRows } from "./social/collection-rows";
import { NoteSummaryRow } from "./notes/note-summary-row";
import type { HostGoal, Note } from "@/domain/types";
import type { SocialCollectionPage } from "./social/types";
const fixture = vi.hoisted(() => ({ writes: vi.fn() }));
vi.mock("react-native", () => ({ StyleSheet: { hairlineWidth: 1 }, View: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("@/i18n", () => ({ useLocale: () => "tr" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values: Record<string, string | number> = {}) => en.replace(/\{(\w+)\}/g, (_all, key: string) => String(values[key] ?? "")) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "computer", capabilities: ["goals.settings"] }) }));
vi.mock("@/state/queries", () => ({ useHostMutation: () => ({ mutate: fixture.writes, isPending: false }) }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: ({ onClose }: { onClose: () => void }) => ({ requestClose: onClose }) }));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("./shared/record-bits", () => ({ useRelativeTime: () => () => "Yesterday" }));
vi.mock("@/ui/message-text", () => ({ MessageText: ({ text }: { text: string }) => h("p", null, text) }));
vi.mock("@/ui/number-field", () => ({ NumberField: ({ label, error, value }: { label: string; error?: string; value: string }) => h("label", { "data-field": label }, value, error ? h("span", { role: "alert" }, error) : null) }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => h("div", null, children);
  return { Stack: Wrapper, Row: Wrapper, Section: Wrapper, NavigationGroup: Wrapper, PressableCard: Wrapper, Body: Wrapper,
    ToggleField: () => null, MutationState: () => null, Badge: () => null,
    Notice: ({ message }: { message: string }) => h("p", null, message),
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => h("button", { onClick: onPress }, label),
    FormActions: () => null };
});
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
function render(node: Parameters<ReturnType<typeof createRoot>["render"]>[0]) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!root) { container = document.createElement("div"); root = createRoot(container); }
  act(() => root!.render(node));
}
afterEach(() => { act(() => root?.unmount()); root = undefined; fixture.writes.mockReset(); vi.unstubAllGlobals(); });
it("places invalid goal limits beside each field without changing the draft or sending", () => {
  const initial = { id: "goal", title: "İstanbul review", status: "running", maxRunningTasks: 9, maxRunMinutes: -1, isolate: true } as HostGoal;
  render(h(GoalSettingsEditor, { initial, onClose: vi.fn() }));
  expect(container.querySelector('[data-field="Concurrent task limit"] [role="alert"]')?.textContent).toBe("Enter a task limit from 0 to 8.");
  expect(container.querySelector('[data-field="Run time limit"] [role="alert"]')?.textContent).toBe("Enter minutes from 0 to 10080.");
  expect(initial.maxRunningTasks).toBe(9); expect(initial.maxRunMinutes).toBe(-1); expect(fixture.writes).not.toHaveBeenCalled();
});
it("formats social page boundaries using the active app locale", () => {
  const page = { page: { offset: 1000, limit: 20, total: 1284 }, loading: false, busy: false, onOffset: vi.fn() } as unknown as SocialCollectionPage;
  render(h(CollectionRows<string>, { items: ["Post"], page, renderItem: item => h("p", { key: item }, item) }));
  expect(container.textContent).toContain("1.001–1.020 / 1.284");
  expect(page.onOffset).not.toHaveBeenCalled();
});
const planningText = "Release planning for İstanbul, Android and accessible collaboration. ";
const hasLoneSurrogate = (value: string) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);
it("keeps the social excerpt emoji intact and retains the complete reader", () => {
  const text = planningText.repeat(4).slice(0, 179) + "👩🏽‍💻" + planningText;
  render(h(ContentExcerpt, { text }));
  expect(hasLoneSurrogate(container.textContent ?? "")).toBe(false);
  act(() => container.querySelector("button")!.click());
  expect(container.textContent).toContain(text);
});
it("keeps a note preview emoji intact without changing its saved body", () => {
  const body = planningText.repeat(12).slice(0, 599) + "👩🏽‍💻" + planningText;
  const note = { id: "note", title: "Planning", body, tags: [], updatedAt: 1 } as unknown as Note;
  render(h(NoteSummaryRow, { note, disabled: false, onPress: vi.fn() }));
  expect(hasLoneSurrogate(container.textContent ?? "")).toBe(false);
  expect(note.body).toBe(body);
});
