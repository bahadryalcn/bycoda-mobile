// @vitest-environment happy-dom
import { act, createElement, useState, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { JiraBoardIssueActions } from "./jira-board-issue";
const state = vi.hoisted(() => ({ project: "project", submit: vi.fn(), busy: false, ready: true,
  readError: null as Error | null,
  draftError: null as unknown, pending: null as unknown, result: null as unknown,
  presses: new Map<string, () => void>(), changes: new Map<string, (value: string) => void>() }));
vi.mock("@/state/machines", () => ({ useMachines: { getState: () => ({ activeId: "machine", selectedProjectId: state.project }) } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/i18n", () => ({ useLocale: () => "tr" }));
vi.mock("@/ui/message-text", () => ({ MessageText: ({text}:{text:string}) => createElement("p",null,text) }));
vi.mock("react-native", () => ({ Linking: { openURL: vi.fn() } }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ uiStyles: { caption: {} } }) }));
vi.mock("../management/shared/record-bits", () => ({ useRelativeTime: () => () => "1 g" }));
vi.mock("@/state/actions", () => ({ useAsyncAction: () => ({ isPending: false, run: async (action: () => Promise<void>) => action() }) }));
vi.mock("../workspace/shared", () => ({ ErrorText: () => null }));
vi.mock("./jira-board-delivery", () => ({ useJiraBoardDelivery: () => ({
  draft: { ready: state.ready, error: state.draftError, value: { pending: state.pending } },
  busy: state.busy, error: null, result: state.result, submit: state.submit, reconcile: vi.fn(),
}) }));
vi.mock("./provider-queries", () => ({ useInboxRead: (request: { action: string }) => ({ data: request.action === "details" ? { body: "Readable description", author: "Reporter" } : [
  { id: "4", name: "Start work", statusId: "2", requiresFields: false },
  { id: "8", name: "Requires custom field", statusId: "3", requiresFields: true },
], isFetching: false, error: state.readError }) }));
vi.mock("@/ui/dialogs", async () => {
  const ui = await import("@/ui/primitives"); return { Sheet: ui.Sheet, FormActions: ui.FormActions };
});
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => {
    state.presses.set(label, onPress); return createElement("button", { disabled, onClick: onPress }, label);
  };
  return { SectionHeader: ({ title, trailing }: { title: string; trailing?: ReactNode }) => createElement("h3", null, title, trailing), Body: Wrap, Heading: Wrap, Row: Wrap, NavigationGroup: Wrap, ValueRow: ({ label, value }: { label: string; value?: string }) => createElement("p", null, `${label}: ${value}`), Badge: ({ label }: { label: string }) => createElement("span", null, label), StatusText: ({ label }: { label: string }) => createElement("span", null, label), Stack: Wrap, QueryState: () => null, MutationState: () => null,
    Sheet: ({ children, footer, title, onClose }: PropsWithChildren<{ footer?: ReactNode; title: string; onClose: () => void }>) =>
      createElement("div", { role: "dialog", "aria-label": title }, children, footer, createElement(Button, { label: `Close ${title}`, onPress: onClose })),
    Notice: ({ message }: { message: string }) => createElement("p", null, message), Button,
    StateView: ({ title, description }: { title: string; description: string }) => createElement("p", null, title, description),
    FormActions: ({ submitLabel, cancelLabel, onSubmit, onCancel }: { submitLabel: string; cancelLabel: string; onSubmit: () => void; onCancel: () => void }) =>
      createElement("div", null, createElement(Button, { label: cancelLabel, onPress: onCancel }), createElement(Button, { label: submitLabel, onPress: onSubmit })),
    Disclosure: ({ label, children, defaultExpanded = false }: PropsWithChildren<{ label: string; defaultExpanded?: boolean }>) => {
      const [open, setOpen] = useState(defaultExpanded); return createElement("div", null,
        createElement(Button, { label, onPress: () => setOpen(!open) }), open ? children : null);
    },
    SelectField: ({ label, value, options, onChange, disabled }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; disabled: boolean }) => {
      state.changes.set(label, onChange); return createElement("select", { "aria-label": label, value, disabled,
        onChange: event => onChange((event.currentTarget as HTMLSelectElement).value) },
        createElement("option", { value: "" }, "Choose"), ...options.map(option => createElement("option", { key: option.value, value: option.value }, option.label)));
    },
  };
});
const issue = { identifier: "ENG-7", title: "Reviewed issue", state: "Open", provider: "jira", kind: "jira", number: 7, repo: "ENG", projectPath: "", priority: "High", labels: [{ name: "bug" }], assignees: [{ login: "Ada" }], updatedAt: "2026-01-01T00:00:00Z" };
const snapshot = { snapshotId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", projectCwd: "G:/Projects/reviewed-project",
  board: { id: 7, name: "Engineering", kind: "kanban" }, configuration: { rankSnapshotAvailable: true,
    sprints: [{ id: 3, name: "Active sprint" }] }, page: { issues: [issue, { identifier: "ENG-8", title: "Anchor" }] } };
const defaults = { origin: { machineId: "machine", projectId: "project" }, snapshot, issue, canWrite: true, onChanged: vi.fn() };
let props = { ...defaults };
let container: HTMLDivElement; let root: ReturnType<typeof createRoot> | undefined;
async function render() { await act(async () => root!.render(createElement(JiraBoardIssueActions, props as never))); }
async function mount() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); await render(); }
async function choose(label: string, value: string) {
  // Moves live in a collapsed disclosure; open it the way a person would before choosing one.
  if (label === "Action" && !container.querySelector('select[aria-label="Action"]')) await click("Move or rank");
  await act(async () => {
  const select = container.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
  select.value = value; select.dispatchEvent(new Event("change", { bubbles: true }));
}); }
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === label)!.click()); }
afterEach(async () => {
  await act(async () => root?.unmount()); root = undefined; container?.remove(); props = { ...defaults };
  state.project = "project"; state.readError = null; state.busy = false; state.ready = true; state.draftError = null; state.pending = null; state.result = null;
  state.presses.clear(); state.changes.clear(); vi.clearAllMocks(); vi.unstubAllGlobals();
});
it("names the board it acts on and says the computer approves the change", async () => {
  await mount();
  expect(container.querySelector("h3")?.textContent).toBe("BoardEngineering");
  await choose("Change status", "4");
  expect(container.textContent).toContain("You approve the change on your computer.");
});
it("hides its actions when the record's computer or project is no longer current", async () => {
  await mount(); await choose("Change status", "4"); const apply = state.presses.get("Apply")!;
  state.project = "other"; await render();
  expect(container.textContent).not.toContain("Engineering"); expect(container.querySelector("select")).toBeNull();
  await act(async () => apply()); expect(state.submit).not.toHaveBeenCalled();
  state.project = "project"; await render();
  expect((container.querySelector('select[aria-label="Change status"]') as HTMLSelectElement).value).toBe("4");
});
it.each([
  ["transition", "Change status", "4", { transitionId: "4" }],
  ["sprint", "Target sprint", "3", { target: "sprint", sprintId: 3 }],
  ["rank", "Displayed anchor issue", "ENG-8", { target: "rank", beforeKey: "ENG-8" }],
  ["backlog", "", "", { target: "backlog" }],
  ["board", "", "", { target: "board" }],
])("sends %s at once, like the desktop's status picker, as exactly the command shown", async (action, field, value, target) => {
  await mount(); if (action !== "transition") await choose("Action", action as string);
  if (field) await choose(field as string, value as string);
  await click("Apply");
  expect(state.submit).toHaveBeenCalledExactlyOnceWith({ action: action === "transition" ? "jira-board-transition" : "jira-board-move",
    input: { projectId: "project", snapshotId: snapshot.snapshotId, key: "ENG-7", confirm: "CHANGE_JIRA_BOARD", ...target as object } });
});
it("ranks after the exact displayed anchor", async () => {
  await mount(); await choose("Action", "rank"); await choose("Displayed anchor issue", "ENG-8"); await choose("Rank direction", "after");
  await click("Apply");
  expect(state.submit.mock.calls[0]![0].input).toMatchObject({ afterKey: "ENG-8" }); expect(state.submit.mock.calls[0]![0].input).not.toHaveProperty("beforeKey");
});
it("keeps field-requiring transitions unavailable and offers Apply only for a complete choice", async () => {
  await mount(); expect(container.textContent).toContain("Complete transitions requiring additional fields in Jira");
  expect(container.querySelector('select[aria-label="Change status"]')?.textContent).not.toContain("Requires custom field");
  expect([...container.querySelectorAll("button")].find(button => button.textContent === "Apply")!.disabled).toBe(true);
  expect(container.textContent).toContain("Choose a new status to continue.");
});
it("sends a retained Apply only for the command it was shown with", async () => {
  await mount(); await choose("Change status", "4"); const old = state.presses.get("Apply")!;
  await choose("Action", "backlog"); await act(async () => old()); expect(state.submit).not.toHaveBeenCalled();
  await click("Apply"); expect(state.submit.mock.calls[0]![0].input.target).toBe("backlog");
});
it.each(["write", "busy", "not-ready", "draft-error", "pending", "result"])("sends nothing while %s holds the section", async (kind) => {
  await mount(); await choose("Change status", "4"); const apply = state.presses.get("Apply")!;
  if (kind === "write") props = { ...props, canWrite: false };
  if (kind === "busy") state.busy = true;
  if (kind === "not-ready") state.ready = false;
  if (kind === "draft-error") state.draftError = Error("Saved draft unavailable");
  if (kind === "pending") state.pending = { command: { input: { key: "ENG-7" }, action: "jira-board-transition" } };
  if (kind === "result") state.result = { outcome: "submitted" };
  await render(); await act(async () => apply()); expect(state.submit).not.toHaveBeenCalled();
});
it("sends nothing from a retained Apply after unmount", async () => {
  await mount(); await choose("Change status", "4"); const apply = state.presses.get("Apply")!;
  await act(async () => root!.unmount()); root = undefined; await act(async () => apply()); expect(state.submit).not.toHaveBeenCalled();
});
