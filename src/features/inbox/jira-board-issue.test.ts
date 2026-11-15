// @vitest-environment happy-dom
import { act, createElement, useState, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { JiraBoardIssueActions } from "./jira-board-issue";
const state = vi.hoisted(() => ({ project: "project", submit: vi.fn(), busy: false, ready: true,
  draftError: null as unknown, pending: null as unknown, result: null as unknown,
  presses: new Map<string, () => void>(), changes: new Map<string, (value: string) => void>() }));
vi.mock("@/state/machines", () => ({ useMachines: { getState: () => ({ activeId: "machine", selectedProjectId: state.project }) } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("../workspace/shared", () => ({ ErrorText: () => null }));
vi.mock("./jira-board-delivery", () => ({ useJiraBoardDelivery: () => ({
  draft: { ready: state.ready, error: state.draftError, value: { pending: state.pending } },
  busy: state.busy, error: null, result: state.result, submit: state.submit, reconcile: vi.fn(),
}) }));
vi.mock("./provider-queries", () => ({ useInboxRead: () => ({ data: [
  { id: "4", name: "Start work", statusId: "2", requiresFields: false },
  { id: "8", name: "Requires custom field", statusId: "3", requiresFields: true },
], isFetching: false }) }));
vi.mock("@/ui/dialogs", async () => {
  const ui = await import("@/ui/primitives"); return { Sheet: ui.Sheet, FormActions: ui.FormActions };
});
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) => {
    state.presses.set(label, onPress); return createElement("button", { disabled, onClick: onPress }, label);
  };
  return { Body: Wrap, Heading: Wrap, Row: Wrap, Badge: ({ label }: { label: string }) => createElement("span", null, label), Stack: Wrap, QueryState: () => null,
    Sheet: ({ children, footer, title, onClose }: PropsWithChildren<{ footer?: ReactNode; title: string; onClose: () => void }>) =>
      createElement("div", { role: "dialog", "aria-label": title }, children, footer, createElement(Button, { label: `Close ${title}`, onPress: onClose })),
    Notice: ({ message }: { message: string }) => createElement("p", null, message), Button,
    FormActions: ({ submitLabel, cancelLabel, onSubmit, onCancel }: { submitLabel: string; cancelLabel: string; onSubmit: () => void; onCancel: () => void }) =>
      createElement("div", null, createElement(Button, { label: cancelLabel, onPress: onCancel }), createElement(Button, { label: submitLabel, onPress: onSubmit })),
    Disclosure: ({ label, children }: PropsWithChildren<{ label: string }>) => {
      const [open, setOpen] = useState(false); return createElement("div", null,
        createElement(Button, { label, onPress: () => setOpen(!open) }), open ? children : null);
    },
    SelectField: ({ label, value, options, onChange, disabled }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; disabled: boolean }) => {
      state.changes.set(label, onChange); return createElement("select", { "aria-label": label, value, disabled,
        onChange: event => onChange((event.currentTarget as HTMLSelectElement).value) },
        createElement("option", { value: "" }, "Choose"), ...options.map(option => createElement("option", { key: option.value, value: option.value }, option.label)));
    },
  };
});
const issue = { identifier: "ENG-7", title: "Reviewed issue", state: "Open" };
const snapshot = { snapshotId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", projectCwd: "G:/Projects/reviewed-project",
  board: { id: 7, name: "Engineering", kind: "kanban" }, configuration: { rankSnapshotAvailable: true,
    sprints: [{ id: 3, name: "Active sprint" }] }, page: { issues: [issue, { identifier: "ENG-8", title: "Anchor" }] } };
const defaults = { origin: { machineId: "machine", projectId: "project" }, snapshot, issue, canWrite: true, onChanged: vi.fn(), onClose: vi.fn() };
let props = { ...defaults };
let container: HTMLDivElement; let root: ReturnType<typeof createRoot> | undefined;
async function render() { await act(async () => root!.render(createElement(JiraBoardIssueActions, props as never))); }
async function mount() { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); container = document.createElement("div"); document.body.append(container); root = createRoot(container); await render(); }
async function choose(label: string, value: string) { await act(async () => {
  const select = container.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
  select.value = value; select.dispatchEvent(new Event("change", { bubbles: true }));
}); }
async function click(label: string) { await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === label)!.click()); }
const review = () => container.querySelector('[role="dialog"][aria-label="Review Jira action"]');
async function openReview() { await choose("Jira transition", "4"); await click("Review action"); }
afterEach(async () => {
  await act(async () => root?.unmount()); root = undefined; container?.remove(); props = { ...defaults };
  state.project = "project"; state.busy = false; state.ready = true; state.draftError = null; state.pending = null; state.result = null;
  state.presses.clear(); state.changes.clear(); vi.clearAllMocks(); vi.unstubAllGlobals();
});
it.each([
  ["transition", "Jira transition", "4", "Change status · Start work (#4)", { transitionId: "4" }],
  ["sprint", "Target sprint", "3", "Move to sprint · Active sprint (#3)", { target: "sprint", sprintId: 3 }],
  ["rank", "Displayed anchor issue", "ENG-8", "Before · ENG-8 · Anchor", { target: "rank", beforeKey: "ENG-8" }],
  ["backlog", "", "", "Move to backlog", { target: "backlog" }],
  ["board", "", "", "Move to board", { target: "board" }],
])("reviews %s by readable name and submits only the exact reviewed command", async (action, field, value, description, target) => {
  await mount(); if (action !== "transition") await choose("Action", action as string);
  if (field) await choose(field as string, value as string);
  await click("Review action"); expect(state.submit).not.toHaveBeenCalled();
  expect(review()?.textContent).toContain(description); expect(review()?.textContent).toContain("Engineering");
  expect(review()?.textContent).toContain("ENG-7 · Reviewed issue"); expect(review()?.textContent).not.toContain("snapshotId");
  await click("Details"); expect(review()?.textContent).toContain(snapshot.projectCwd); expect(review()?.textContent).toContain(snapshot.snapshotId);
  await click("Request approval on computer");
  expect(state.submit).toHaveBeenCalledExactlyOnceWith({ action: action === "transition" ? "jira-board-transition" : "jira-board-move",
    input: { projectId: "project", snapshotId: snapshot.snapshotId, key: "ENG-7", confirm: "CHANGE_JIRA_BOARD", ...target as object } });
  expect(review()).toBeNull();
});
it("reviews after-position with the exact displayed anchor", async () => {
  await mount(); await choose("Action", "rank"); await choose("Displayed anchor issue", "ENG-8"); await choose("Rank direction", "after");
  await click("Review action"); expect(review()?.textContent).toContain("After · ENG-8 · Anchor"); await click("Request approval on computer");
  expect(state.submit.mock.calls[0]![0].input).toMatchObject({ afterKey: "ENG-8" }); expect(state.submit.mock.calls[0]![0].input).not.toHaveProperty("beforeKey");
});
it("keeps field-requiring transitions unavailable and rejects a changed origin", async () => {
  await mount(); expect(container.textContent).toContain("Complete transitions requiring additional fields in Jira");
  expect(container.querySelector('select[aria-label="Jira transition"]')?.textContent).not.toContain("Requires custom field");
  await openReview(); state.project = "other"; await click("Request approval on computer"); expect(state.submit).not.toHaveBeenCalled();
});
it("cancel preserves choices, retires its callback and permits a new review", async () => {
  await mount(); await openReview(); const old = state.presses.get("Request approval on computer")!;
  await click("Cancel"); expect(review()).toBeNull(); expect((container.querySelector('select[aria-label="Jira transition"]') as HTMLSelectElement).value).toBe("4");
  await act(async () => old()); expect(state.submit).not.toHaveBeenCalled(); await click("Review action");
  await act(async () => old()); expect(state.submit).not.toHaveBeenCalled(); await click("Request approval on computer"); expect(state.submit).toHaveBeenCalledOnce();
});
it("rejects repeated retained confirmation and hidden-editor changes", async () => {
  await mount(); const change = state.changes.get("Action")!; await openReview();
  const confirm = state.presses.get("Request approval on computer")!;
  await act(async () => change("backlog")); expect(review()?.textContent).toContain("Start work");
  await act(async () => { confirm(); confirm(); }); expect(state.submit).toHaveBeenCalledOnce();
});
it.each(["write", "busy", "not-ready", "draft-error", "pending", "result"])("retires a review across %s loss and restoration", async (kind) => {
  await mount(); await openReview(); const confirm = state.presses.get("Request approval on computer")!;
  if (kind === "write") props = { ...props, canWrite: false };
  if (kind === "busy") state.busy = true;
  if (kind === "not-ready") state.ready = false;
  if (kind === "draft-error") state.draftError = Error("Saved draft unavailable");
  if (kind === "pending") state.pending = { command: { input: { key: "ENG-7" }, action: "jira-board-transition" } };
  if (kind === "result") state.result = { outcome: "submitted" };
  await render(); expect(review()).toBeNull(); await act(async () => confirm()); expect(state.submit).not.toHaveBeenCalled();
  props = { ...props, canWrite: true }; state.busy = false; state.ready = true; state.draftError = null; state.pending = null; state.result = null;
  await render(); await act(async () => confirm()); expect(state.submit).not.toHaveBeenCalled(); expect(review()).toBeNull();
});
it("retires retained confirmation on unmount", async () => {
  await mount(); await openReview(); const confirm = state.presses.get("Request approval on computer")!;
  await act(async () => root!.unmount()); root = undefined; await act(async () => confirm()); expect(state.submit).not.toHaveBeenCalled();
});

it("rejects an obsolete editor review and an obsolete review dismissal", async () => {
  await mount(); await choose("Jira transition", "4"); const oldReview = state.presses.get("Review action")!;
  await choose("Action", "backlog"); await act(async () => oldReview()); expect(review()).toBeNull();
  await click("Review action"); const oldCancel = state.presses.get("Cancel")!; await click("Cancel");
  await click("Review action"); await act(async () => oldCancel()); expect(review()).not.toBeNull();
  await click("Request approval on computer"); expect(state.submit.mock.calls[0]![0].input.target).toBe("backlog");
});
