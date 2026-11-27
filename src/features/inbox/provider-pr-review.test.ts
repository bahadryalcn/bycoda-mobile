// @vitest-environment happy-dom
import { act, createElement, useSyncExternalStore, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ProviderPrReview } from "./provider-pr-review";
import { emptyPrReviewDraft, type PrReviewDraft } from "./provider-review-draft";
import type { PrDiffFile } from "./provider-pr-diff-model";
import { prReviewSessionKey, usePrReviewSession } from "./provider-pr-review-session";
import { PrReviewFileView } from "./provider-pr-review-file";

/** The pushed file page: router.push records the path, and this stands in for its route over the review. */
const route = vi.hoisted(() => ({ path: null as string | null, listeners: new Set<() => void>(),
  set(path: string | null) { route.path = path; for (const listener of route.listeners) listener(); } }));
vi.mock("expo-router", () => ({ router: { push: (href: { params: { path: string } }) => route.set(href.params.path) } }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => ({ requestClose: () => {}, requestCloseThen: () => {} }) }));
function FilePage() {
  const path = useSyncExternalStore((notify) => { route.listeners.add(notify); return () => { route.listeners.delete(notify); }; }, () => route.path);
  const session = usePrReviewSession(prReviewSessionKey(defaults.origin, { provider: "github", kind: "pr", repo: "owner/repo", number: 7, projectPath: "/project" }));
  const file = path ? session?.file(path) : undefined;
  if (!session || !file) return null;
  return createElement(PrReviewFileView, { file, comments: session.comments, commenting: session.commenting,
    onSave: (anchor, body, index) => session.save(file.path, anchor, body, index), onRemove: session.remove, onClose: () => route.set(null) });
}

const state = vi.hoisted(() => ({
  active: "machine",
  project: "project",
  truncated: false,
  extraFile: false,
  head: "a".repeat(40),
  draft: null as PrReviewDraft | null,
  submit: vi.fn(),
  confirms: [] as Array<() => void>,
  supported: true,
  reads: [] as boolean[], refetch: vi.fn(), reconcile: vi.fn(),
  busy: false, ready: true, queryError: null as unknown, fetching: false, noData: false,
  updateDraft: null as null | ((change: (value: PrReviewDraft) => PrReviewDraft) => void),
}));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({ id: "machine", capabilities: state.supported ? ["inbox.review.v1"] : [] }),
  useMachines: { getState: () => ({ activeId: state.active, selectedProjectId: state.project }) },
}));
vi.mock("./inbox-local-scope", () => ({
  useInboxLocalScope: () => ({ matches: (origin: { machineId: string; projectId: string }) => origin.machineId === state.active && origin.projectId === state.project }),
}));
vi.mock("@/ui/copy", () => ({
  useCopy: () => (_tr: string, en: string, params?: Record<string, string | number>) =>
    en.replace(/\{(\w+)\}/g, (key, name: string) => String(params?.[name] ?? key)),
}));
vi.mock("@/ui/confirm", () => ({ confirmAction: (_title: string, _body: string, _label: string, apply: () => void) => { state.confirms.push(apply); } }));
vi.mock("../workspace/shared", () => ({ ErrorText: () => null }));
vi.mock("../pull-requests/model/list", () => ({ isTestFile: (path: string) => path.includes(".test.") }));
vi.mock("./provider-queries", () => ({
  INBOX_RECORD_CACHE_MS: 1_800_000,
  useInboxRead: (_request: unknown, enabled: boolean) => {
    state.reads.push(enabled);
    return {
      data: state.noData ? undefined : {
        commitId: state.head, headOid: state.head, additions: 1, deletions: 1, truncated: state.truncated,
        files: [{ path: "src/file.ts", additions: 1, deletions: 1 }, ...(state.extraFile ? [{ path: "src/api.test.ts", additions: 1, deletions: 0 }] : [])],
        patch: "diff --git a/src/file.ts b/src/file.ts\n--- a/src/file.ts\n+++ b/src/file.ts\n@@ -1 +1 @@\n-old\n+new\n" +
          (state.extraFile ? "diff --git a/src/api.test.ts b/src/api.test.ts\n--- /dev/null\n+++ b/src/api.test.ts\n@@ -0,0 +1 @@\n+test-line\n" : ""),
      },
      refetch: state.refetch, isFetching: state.fetching, error: state.queryError,
    };
  },
}));
vi.mock("./provider-review-delivery", async () => {
  const { useState } = await import("react");
  return {
    usePrReviewDelivery: () => {
      const [value, update] = useState(state.draft ?? emptyPrReviewDraft());
      state.updateDraft = update;
      return {
        value, busy: state.busy, error: null, submit: state.submit, reconcile: state.reconcile,
        draft: {
          ready: state.ready, error: null, load: vi.fn(),
          setValue: (change: PrReviewDraft | ((current: PrReviewDraft) => PrReviewDraft)) =>
            update((current) => { const next = typeof change === "function" ? change(current) : change; state.draft = next; return next; }),
        },
      };
    },
  };
});
vi.mock("./provider-pr-review-summary", () => ({
  PrReviewHeader: ({ item, context }: { item: { repo: string; number: number; title: string }; context?: { commitId: string } }) =>
    createElement("header", null, `${item.repo} #${item.number}`, context?.commitId),
  PrFileRow: ({ file, comments, onPress }: { file: PrDiffFile; comments: number; onPress: () => void }) =>
    createElement("button", { "data-file": file.path, onClick: onPress }, `${file.path}${comments ? ` (${comments})` : ""}`),
  DiffStats: () => null,
  PrFilesSkeleton: () => createElement("p", null, "files-skeleton"),
}));
// The diff sheet is exercised on its own; here it exposes one "comment" control per anchored line.
vi.mock("./provider-pr-review-file", () => ({
  PrReviewFileView: ({ file, commenting, onSave, onClose, footer }: {
    file: PrDiffFile; commenting: { enabled: boolean; reason?: string }; footer?: ReactNode;
    onSave: (anchor: { side: "LEFT" | "RIGHT"; line: number }, body: string) => void; onClose: () => void;
  }) => createElement("section", { "aria-label": `diff ${file.path}` },
    commenting.reason ?? "",
    ...file.rows.map((row) => row.type === "line" ? createElement("div", { key: row.id }, `${row.kind === "add" ? "+" : row.kind === "remove" ? "−" : " "}${row.text}`,
      commenting.enabled && row.anchor ? createElement("button", { onClick: () => onSave(row.anchor!, `note ${row.anchor!.side} ${row.anchor!.line}`) }, `comment ${row.anchor.side}:${row.anchor.line}`) : null) : null),
    createElement("button", { onClick: onClose }, "Close file"), footer),
}));
vi.mock("./provider-pr-review-submit", () => ({
  PrReviewSubmitSheet: (props: { event: string; decisions: string[]; restriction?: string; canSubmit: boolean; stale: boolean; commitId?: string;
    onChangeEvent: (event: string) => void; onChangeBody: (body: string) => void; onSubmit: () => void; onClose: () => void; onRebind: () => void }) =>
    createElement("section", { "aria-label": "submit" },
      `event:${props.event} decisions:${props.decisions.join(",")} ${props.restriction ?? ""} commit:${props.commitId}`,
      createElement("button", { onClick: () => props.onChangeBody("Please preserve behavior") }, "Write summary"),
      createElement("button", { onClick: () => props.onChangeEvent("APPROVE") }, "Pick approve"),
      createElement("button", { disabled: !props.canSubmit, onClick: props.onSubmit }, "Send"),
      createElement("button", { onClick: props.onClose }, "Close submit")),
}));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Body: Wrap,
    QueryState: () => null,
    NoResults: ({ title }: { title: string }) => createElement("p", null, title),
    ToggleField: ({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) => createElement("button", { onClick: () => onChange(!value) }, label),
    SearchField: () => null,
    useCollapsibleSearch: (_field: unknown, options: { filters?: ReactNode }) => ({ trigger: null, filterTrigger: null, sheet: options.filters }),
    SectionHeader: ({ title, trailing }: { title: string; trailing?: ReactNode }) => createElement("h2", null, title, trailing),
    Screen: ({ children, footer }: PropsWithChildren<{ footer?: ReactNode }>) => createElement("main", null, children, footer),
    Notice: ({ message, action }: { message: string; action?: { label: string; onPress: () => void } }) =>
      createElement("p", null, message, action ? createElement("button", { onClick: action.onPress }, action.label) : null),
    StateView: ({ title, description }: { title: string; description?: string }) => createElement("p", null, title, description),
    Button: ({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean }) =>
      createElement("button", { disabled: disabled || busy, onClick: onPress }, label),
    ScreenList: ({ data, header, renderItem, ListEmptyComponent }: { data: Array<{ path: string }>; header: ReactNode; ListEmptyComponent?: ReactNode; renderItem: (row: { item: unknown }) => ReactNode }) =>
      createElement("div", null, header, ...(data.length ? data.map((item) => createElement("div", { key: item.path }, renderItem({ item }))) : [ListEmptyComponent])),
  };
});
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));

const defaults = {
  item: { provider: "github", kind: "pr", repo: "owner/repo", number: 7, title: "Title", state: "OPEN", projectPath: "/project" },
  origin: { machineId: "machine", projectId: "project" },
  canRead: true, canWrite: true, onClose: vi.fn(),
};
let props = { ...defaults };
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
const submitSheet = () => container.querySelector('[aria-label="submit"]');
async function render() { await act(async () => root.render(createElement("div", null, createElement(ProviderPrReview, props as never), createElement(FilePage)))); }
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.body.append(container);
  root = createRoot(container);
  await render();
}
const buttons = (label: string) => [...container.querySelectorAll("button")].filter((button) => button.textContent === label || button.textContent?.startsWith(`${label} `));
async function click(label: string, at = 0) {
  const target = buttons(label)[at];
  if (!target) throw new Error(`No button ${label}: ${container.textContent}`);
  await act(async () => target.click());
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container.remove(); props = { ...defaults };
  Object.assign(state, { reads: [], busy: false, ready: true, queryError: null, fetching: false, noData: false, updateDraft: null, draft: null,
    active: "machine", project: "project", head: "a".repeat(40), truncated: false, extraFile: false, supported: true, confirms: [] });
  route.path = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("binds a fresh review to the shown head so a tapped line becomes a pending comment at once", async () => {
  await mount();
  expect(state.draft?.commitId).toBe(state.head);
  await click("src/file.ts");
  expect(container.querySelector('[aria-label="diff src/file.ts"]')?.textContent).toContain("−old");
  await click("comment LEFT:1");
  expect(state.draft?.comments).toEqual([{ path: "src/file.ts", side: "LEFT", line: 1, body: "note LEFT 1" }]);
  // The same line edits its comment instead of adding a second one.
  await click("comment LEFT:1");
  expect(state.draft?.comments).toHaveLength(1);
  await click("comment RIGHT:1");
  expect(buttons("Submit review (2 comments)").length).toBeGreaterThan(0);
  expect(container.textContent).toContain("src/file.ts (2)");
});

it("submits decision, summary and every pending comment against the reviewed head", async () => {
  await mount();
  await click("src/file.ts");
  await click("comment LEFT:1");
  await click("Close file");
  await click("Submit review (1 comments)");
  expect(submitSheet()?.textContent).toContain("decisions:COMMENT,APPROVE,REQUEST_CHANGES");
  expect(buttons("Send")[0]?.disabled).toBe(true); // A comment review needs a summary.
  await click("Write summary");
  await click("Send");
  expect(state.submit).toHaveBeenCalledExactlyOnceWith({
    commitId: state.head, event: "COMMENT", body: "Please preserve behavior",
    comments: [{ path: "src/file.ts", side: "LEFT", line: 1, body: "note LEFT 1" }],
  });
});

it("offers only comments on a closed pull request", async () => {
  props = { ...defaults, item: { ...defaults.item, state: "CLOSED" } };
  state.draft = { ...emptyPrReviewDraft(), commitId: state.head, event: "APPROVE" };
  await mount();
  expect(state.draft?.event).toBe("COMMENT");
  await click("Submit review");
  expect(submitSheet()?.textContent).toContain("decisions:COMMENT ");
  expect(submitSheet()?.textContent).toContain("Closed pull requests accept comments only.");
});

it("hides test files from the list without dropping their pending comments", async () => {
  state.extraFile = true;
  state.draft = { ...emptyPrReviewDraft(), commitId: state.head, comments: [{ path: "src/api.test.ts", side: "RIGHT", line: 1, body: "Keep" }] };
  await mount();
  expect(container.querySelector('[data-file="src/api.test.ts"]')).not.toBeNull();
  await click("Hide test files");
  expect(container.querySelector('[data-file="src/api.test.ts"]')).toBeNull();
  expect(container.textContent).toContain("1 test files hidden");
  expect(state.draft?.comments).toHaveLength(1);
});

it("keeps old inline comments when the head moves and rebinds only after confirmation", async () => {
  state.draft = { ...emptyPrReviewDraft(), commitId: "b".repeat(40), body: "Retained summary",
    comments: [{ path: "src/file.ts", side: "LEFT", line: 1, body: "Retained inline" }] };
  await mount();
  expect(container.textContent).toContain("Old inline comments are retained");
  await click("src/file.ts");
  expect(container.textContent).toContain("New commits arrived. Review the current head to add comments.");
  expect(buttons("comment LEFT:1")).toHaveLength(0);
  await click("Review current head");
  expect(state.draft?.comments).toHaveLength(1);
  await act(async () => state.confirms[0]!());
  expect(state.draft).toMatchObject({ comments: [], body: "Retained summary", commitId: state.head });
});

it("shows a partial diff read-only and still allows a summary review", async () => {
  state.truncated = true;
  await mount();
  await click("src/file.ts");
  expect(container.textContent).toContain("+new");
  expect(buttons("comment RIGHT:1")).toHaveLength(0);
  expect(container.textContent).toContain("line comments are unavailable");
});

it("shows the file-shaped skeleton while the first read runs", async () => {
  state.noData = true;
  await mount();
  expect(container.textContent).toContain("files-skeleton");
  expect(state.draft).toBeNull();
});

it.each(["read", "project", "capability", "auth"])("conceals private context across %s loss and refuses stale callbacks", async (kind) => {
  state.draft = { ...emptyPrReviewDraft(), commitId: state.head, body: "Private summary", comments: [{ path: "src/file.ts", side: "LEFT", line: 1, body: "Private inline" }] };
  await mount();
  await click("src/file.ts");
  const comment = buttons("comment RIGHT:1")[0]!;
  const before = JSON.stringify(state.draft);
  if (kind === "read") props = { ...props, canRead: false };
  if (kind === "project") state.project = "other";
  if (kind === "capability") state.supported = false;
  if (kind === "auth") state.queryError = Object.assign(Error("Access unavailable"), { kind: "auth" });
  await render();
  expect(container.textContent).not.toContain("owner/repo");
  expect(container.textContent).not.toContain("src/file.ts");
  expect(container.textContent).not.toContain("+new");
  await act(async () => comment.click());
  expect(JSON.stringify(state.draft)).toBe(before);
  props = { ...defaults }; state.project = "project"; state.supported = true; state.queryError = null;
  await render();
  expect(container.textContent).toContain("src/file.ts (1)");
});

it("retains pending receipt recovery while private context is concealed", async () => {
  state.draft = { ...emptyPrReviewDraft(), commitId: state.head, body: "Private summary", pending: { requestId: "pending-review", environmentId: "env" } };
  await mount();
  expect(container.textContent).toContain("review outcome is unconfirmed");
  props = { ...props, canRead: false };
  await render();
  expect(container.textContent).toContain("review outcome is unconfirmed");
  expect(buttons("Check review result")[0]?.disabled).toBe(true);
  props = { ...defaults };
  await render();
  await click("Check review result");
  expect(state.reconcile).toHaveBeenCalledOnce();
});
