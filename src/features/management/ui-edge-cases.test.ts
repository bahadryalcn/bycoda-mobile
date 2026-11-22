// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { GoalSettingsEditor } from "./goals/settings-editor";
import { NoteSummaryRow } from "./notes/note-summary-row";
import type { HostGoal, Note } from "@/domain/types";
const fixture = vi.hoisted(() => ({ writes: vi.fn() }));
vi.mock("react-native", () => ({ StyleSheet: { hairlineWidth: 1 }, View: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("panelui-native/components/collapsible", () => ({
  Collapsible: Object.assign(({ children }: PropsWithChildren) => h("div", null, children), {
    Trigger: ({ children }: PropsWithChildren) => h("button", null, children),
    Content: ({ children }: PropsWithChildren) => h("div", null, children),
    Indicator: () => null,
  }),
}));
vi.mock("@/i18n", () => ({ useLocale: () => "tr" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, values: Record<string, string | number> = {}) => en.replace(/\{(\w+)\}/g, (_all, key: string) => String(values[key] ?? "")) }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => ({ id: "computer", capabilities: ["goals.settings"] }) }));
vi.mock("@/state/queries", () => ({ useHostMutation: () => ({ mutate: fixture.writes, isPending: false }) }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: ({ onClose }: { onClose: () => void }) => ({ requestClose: onClose }) }));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("@/state/connection-scope", () => ({ useConnectionScope: () => ({ isCurrent: () => true }) }));
vi.mock("@/ui/toast", () => ({ showToast: vi.fn() }));
vi.mock("./shared/record-bits", () => ({ useRelativeTime: () => () => "Yesterday" }));
vi.mock("@/ui/message-text", () => ({ MessageText: ({ text }: { text: string }) => h("p", null, text) }));
vi.mock("@/ui/number-field", () => ({ NumberField: ({ label, error, value }: { label: string; error?: string; value: string }) => h("label", { "data-field": label }, value, error ? h("span", { role: "alert" }, error) : null) }));
vi.mock("@/ui/limit-presets", async () =>
  (await import("@/ui/limit-presets.fixture")).limitFieldDoubles((await import("@/ui/number-field")).NumberField as never));
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
  const initial = { id: "goal", title: "İstanbul review", status: "running", maxRunningTasks: -1, maxRunMinutes: -1, isolate: true } as HostGoal;
  render(h(GoalSettingsEditor, { initial, onClose: vi.fn() }));
  expect(container.querySelector('[data-field="Concurrent task limit"] [role="alert"]')?.textContent).toBe("Enter zero or a positive safe integer.");
  expect(container.querySelector('[data-field="Run time limit"] [role="alert"]')?.textContent).toBe("Enter minutes from 0 to 10080.");
  expect(initial.maxRunningTasks).toBe(-1); expect(initial.maxRunMinutes).toBe(-1); expect(fixture.writes).not.toHaveBeenCalled();
});
const planningText = "Release planning for İstanbul, Android and accessible collaboration. ";
const hasLoneSurrogate = (value: string) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);
it("keeps a note preview emoji intact without changing its saved body", () => {
  const body = planningText.repeat(12).slice(0, 599) + "👩🏽‍💻" + planningText;
  const note = { id: "note", title: "Planning", body, tags: [], updatedAt: 1 } as unknown as Note;
  render(h(NoteSummaryRow, { note, disabled: false, onPress: vi.fn() }));
  expect(hasLoneSurrogate(container.textContent ?? "")).toBe(false);
  expect(note.body).toBe(body);
});
it("shows readable note excerpts without repeating the leading title", () => {
  const body = "## **Planning**\n\nReview the [release checklist](https://example.com/checklist).\n\n- Verify `Android`.";
  const note = { id: "note", title: "Planning", body, tags: [], updatedAt: 1 } as unknown as Note;
  render(h(NoteSummaryRow, { note, disabled: false, onPress: vi.fn() }));
  const text = container.textContent ?? "";
  expect(text).toContain("Review the release checklist. Verify Android.");
  expect(text.match(/Planning/g)).toHaveLength(1);
  expect(text).not.toContain("https://example.com/checklist");
  expect(note.body).toBe(body);
});
it("continues a note excerpt after a generated title that ends mid-word", () => {
  const start = "Release planning for İstanbul and Android. ".repeat(5).slice(0, 197);
  const body = `${start} Android check. Verify the release checklist.`;
  const title = body.slice(0, 200);
  const note = { id: "long-note", title, body, tags: [], updatedAt: 1 } as unknown as Note;
  render(h(NoteSummaryRow, { note, disabled: false, onPress: vi.fn() }));
  expect(container.textContent).toContain("check. Verify the release checklist.");
  expect(container.textContent).not.toContain("droid check.");
  expect((container.textContent ?? "").split(start)).toHaveLength(2);
  expect(note.body).toBe(body);
});
it("keeps a short title word when it begins a sentence in the note", () => {
  const note = { id: "note", title: "Planning", body: "Planning starts on Monday.", tags: [], updatedAt: 1 } as unknown as Note;
  render(h(NoteSummaryRow, { note, disabled: false, onPress: vi.fn() }));
  expect(container.textContent).toContain("Planning starts on Monday.");
});
it("shows the project on a note row only when one is supplied", () => {
  const note = { id: "note", title: "Planning", body: "Body", tags: [], updatedAt: 1 } as unknown as Note;
  render(h(NoteSummaryRow, { note, disabled: false, onPress: vi.fn(), projectName: "Atlas" }));
  expect(container.textContent).toContain("Atlas");
});
