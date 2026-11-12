// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ProviderPrReview } from "./provider-pr-review";
import { emptyPrReviewDraft, type PrReviewDraft } from "./provider-review-draft";
const state = vi.hoisted(() => ({
  active: "machine",
  project: "project",
  truncated: false,
  head: "a".repeat(40),
  draft: null as PrReviewDraft | null,
  submit: vi.fn(),
  confirms: [] as Array<() => void>,
  confirmBodies: [] as string[],
  supported: true,
  reads: [] as boolean[], refetch: vi.fn(), reconcile: vi.fn(), changes: new Map<string, (value: string) => void>(),
  presses: new Map<string, () => void>(),
  busy: false, ready: true, queryError: null as unknown, fetching: false,
  updateDraft: null as null | ((change: (value: PrReviewDraft) => PrReviewDraft) => void),
}));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({
    id: "machine",
    capabilities: state.supported ? ["inbox.review.v1"] : [],
  }),
  useMachines: { getState: () => ({ activeId: state.active, selectedProjectId: state.project }) },
}));
vi.mock("@/ui/copy", () => ({
  useCopy: () => (_tr: string, en: string, params?: Record<string, string | number>) =>
    en.replace(/\{(\w+)\}/g, (key, name: string) => String(params?.[name] ?? key)),
}));
vi.mock("@/ui/confirm", () => ({
  confirmAction: (_title: string, body: string, _label: string, apply: () => void) => {
    state.confirmBodies.push(body);
    state.confirms.push(apply);
  },
}));
vi.mock("@/ui/sheet-guard", () => ({
  useSheetGuard: ({ onClose }: { onClose: () => void }) => ({ requestClose: onClose }),
}));
vi.mock("../workspace/shared", () => ({ ErrorText: () => null }));
vi.mock("./provider-queries", () => ({
  useInboxRead: (_request: unknown, enabled: boolean) => { state.reads.push(enabled); return ({
    data: {
      commitId: state.head,
      headOid: state.head,
      additions: 1,
      deletions: 1,
      files: [{ path: "src/file.ts", additions: 1, deletions: 1 }],
      patch:
        "diff --git a/src/file.ts b/src/file.ts\n--- a/src/file.ts\n+++ b/src/file.ts\n@@ -1 +1 @@\n-old\n+new\n",
      truncated: state.truncated,
    },
    refetch: state.refetch,
    isFetching: state.fetching,
    error: state.queryError,
  }); },
}));
vi.mock("./provider-review-delivery", async () => {
  const { useState } = await import("react");
  return {
    usePrReviewDelivery: () => {
      const [value, update] = useState(state.draft ?? emptyPrReviewDraft());
      state.updateDraft = update;
      return {
        value,
        busy: state.busy,
        error: null,
        submit: state.submit,
        reconcile: state.reconcile,
        draft: {
          ready: state.ready,
          error: null,
          load: vi.fn(),
          setValue: (change: PrReviewDraft | ((current: PrReviewDraft) => PrReviewDraft)) =>
            update((current) => {
              const next = typeof change === "function" ? change(current) : change;
              state.draft = next;
              return next;
            }),
        },
      };
    },
  };
});
vi.mock("@/ui/dialogs", async () => {
  const ui = await import("@/ui/primitives"); return { Sheet: ui.Sheet, FormActions: ui.FormActions };
});
vi.mock("./provider-pr-review-summary", () => ({
  PrReviewSummary: ({ item, context }: { item: { repo: string; number: number }; context?: { commitId: string; files: { path: string }[] } }) =>
    createElement("div", null, `${item.repo} #${item.number}`, context?.commitId, context?.files.map((file) => file.path).join(",")),
  PrDiffLine: ({ line }: { line: { kind: string; text: string } }) =>
    createElement("div", null, `${line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}${line.text}`),
}));
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Body: Wrap,
    Stack: Wrap,
    Row: Wrap,
    QueryState: () => null,
    SectionHeader: ({ title }: { title: string }) => createElement("div", null, title),
    Sheet: ({ children, footer, title }: PropsWithChildren<{ footer?: ReactNode; title: string }>) =>
      createElement("div", { role: "dialog", "aria-label": title }, children, footer),
    FormActions: ({submitLabel, cancelLabel, onSubmit, onCancel}: {submitLabel: string; cancelLabel: string; onSubmit: () => void; onCancel: () => void}) => {
      state.presses.set(submitLabel, onSubmit); state.presses.set(cancelLabel, onCancel);
      return createElement("div",null,createElement("button",{onClick:onSubmit},submitLabel),createElement("button",{onClick:onCancel},cancelLabel));
    },
    Notice: ({ message }: { message: string }) => createElement("p", null, message),
    StateView: ({ title, description }: any) => createElement("p", null, title, description), 
    Button: ({
      label,
      onPress,
      disabled,
      busy,
    }: {
      label: string;
      onPress: () => void;
      disabled?: boolean;
      busy?: boolean;
    }) => { state.presses.set(label, onPress); return createElement("button", { disabled: disabled || busy, onClick: onPress }, label); },
    Field: ({
      label,
      value,
      onChangeText,
      editable,
    }: {
      label: string;
      value: string;
      onChangeText: (value: string) => void;
      editable: boolean;
    }) => { state.changes.set(label, onChangeText); return createElement("textarea", {
        "aria-label": label,
        value,
        disabled: !editable,
        onChange: (event) => onChangeText((event.currentTarget as HTMLTextAreaElement).value),
      }); },
    SelectField: () => null,
    ScreenList: ({
      data,
      header,
      renderItem,
    }: {
      data: Array<{ id: string }>;
      header: ReactNode;
      renderItem: (row: { item: unknown }) => ReactNode;
    }) =>
      createElement(
        "div",
        null,
        header,
        ...data.map((item) => createElement("div", { key: item.id }, renderItem({ item }))),
      ),
  };
});
const defaults = {
  item: { provider: "github", kind: "pr", repo: "owner/repo", number: 7, projectPath: "/project" },
  origin: { machineId: "machine", projectId: "project" },
  canRead: true,
  canWrite: true,
  onClose: vi.fn(),
};
let props = { ...defaults };
const container = document.createElement("div");
const preflight = () => container.querySelector('[role="dialog"][aria-label="Submit pull request review"]');
async function render() { await act(async () => root.render(createElement(ProviderPrReview, props as never))); }
let root: ReturnType<typeof createRoot>;
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(ProviderPrReview, props as never)));
}
async function click(label: string, at = 0) {
  await act(async () =>
    [...container.querySelectorAll("button")]
      .filter((button) => button.textContent === label)
      [at]!.click(),
  );
}
async function type(label: string, value: string) {
  await act(async () => {
    const field = container.querySelector(`textarea[aria-label="${label}"]`) as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    setter.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
afterEach(async () => {
  await act(async () => root?.unmount());
  container.remove(); props = { ...defaults };
  state.reads = []; state.changes.clear();
  state.presses.clear(); state.busy = false; state.ready = true; state.queryError = null; state.fetching = false; state.updateDraft = null;
  state.draft = null;
  state.active = "machine";
  state.project = "project";
  state.head = "a".repeat(40);
  state.truncated = false;
  state.supported = true;
  state.confirms = [];
  state.confirmBodies = [];
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("requires explicit head review, uses the displayed removed-side anchor and submits only after confirmation", async () => {
  await mount();
  expect(state.submit).not.toHaveBeenCalled();
  await click("Review current head");
  await type("Review summary", "Please preserve behavior");
  await click("Comment on this line", 0);
  await type("Inline comment", "Keep the old behavior");
  expect(state.draft?.comments[0]).toEqual({
    path: "src/file.ts",
    side: "LEFT",
    line: 1,
    body: "Keep the old behavior",
  });
  await click("Submit review");
  expect(state.submit).not.toHaveBeenCalled();
  expect(preflight()).not.toBeNull();
  await click("Submit");
  expect(state.submit).toHaveBeenCalledExactlyOnceWith({
    commitId: "a".repeat(40),
    event: "COMMENT",
    body: "Please preserve behavior",
    comments: [{ path: "src/file.ts", side: "LEFT", line: 1, body: "Keep the old behavior" }],
  });
});
it.each([
  ["COMMENT", "Comment"],
  ["APPROVE", "Approve"],
  ["REQUEST_CHANGES", "Request changes"],
] as const)(
  "shows the readable %s decision while preserving the exact submitted enum",
  async (event, label) => {
    state.draft = {
      ...emptyPrReviewDraft(),
      commitId: state.head,
      body: "Reviewed summary",
      event,
    };
    await mount();
    await click("Submit review");
    expect(preflight()?.textContent).toContain(label);
    expect(preflight()?.textContent).toContain(state.head);
    expect(preflight()?.textContent).toContain("Reviewed summary");
    expect(state.submit).not.toHaveBeenCalled();
    await click("Submit");
    expect(state.submit).toHaveBeenCalledWith(
      expect.objectContaining({ event, commitId: state.head }),
    );
  },
);
it("shows a partial patch read-only without creating inline targets and blocks a stale confirmation after a project switch", async () => {
  state.truncated = true;
  state.draft = { ...emptyPrReviewDraft(), commitId: state.head, body: "Summary only" };
  await mount();
  expect(container.textContent).toContain("-old");
  expect(container.textContent).toContain("+new");
  expect(container.textContent).not.toContain("Comment on this line");
  await click("Submit review");
  state.project = "different-project";
  await click("Submit");
  expect(state.submit).not.toHaveBeenCalled();
});
it("keeps old inline drafts when the head moves and requires confirmation before rebinding", async () => {
  state.draft = {
    ...emptyPrReviewDraft(),
    commitId: "b".repeat(40),
    body: "Retained summary",
    comments: [{ path: "src/file.ts", side: "LEFT", line: 1, body: "Retained inline" }],
  };
  await mount();
  expect(container.textContent).toContain("Old inline comments are retained");
  await click("Submit review");
  expect(state.submit).not.toHaveBeenCalled();
  await click("Review current head");
  expect(state.draft?.comments).toHaveLength(1);
  await act(async () => state.confirms[0]!());
  expect(state.draft?.comments).toEqual([]);
  expect(state.draft?.body).toBe("Retained summary");
  expect(state.draft?.commitId).toBe(state.head);
});

it("cancels without changing the full summary or inline draft and retires old confirmation", async () => {
  state.draft = { ...emptyPrReviewDraft(), commitId: state.head, body: "Long summary\n".repeat(1800), comments: [{path:"src/file.ts",side:"RIGHT",line:1,body:"Keep the added line"}] };
  await mount(); const before = JSON.stringify(state.draft); await click("Submit review");
  expect(preflight()?.textContent).toContain(state.draft.body); expect(preflight()?.textContent).toContain("New line 1");
  expect(preflight()?.textContent).toContain("Keep the added line"); const old = state.presses.get("Submit")!;
  await click("Cancel"); expect(preflight()).toBeNull(); expect(JSON.stringify(state.draft)).toBe(before);
  await click("Submit review"); await act(async () => old()); expect(state.submit).not.toHaveBeenCalled();
  const confirm = state.presses.get("Submit")!; await act(async () => {confirm();confirm();}); expect(state.submit).toHaveBeenCalledOnce();
});
it.each(["read","write","busy","readiness","head","query-error","fetching","draft"])("retires the preflight after %s changes", async (kind) => {
  state.draft = { ...emptyPrReviewDraft(), commitId:state.head, body:"Reviewed summary" }; await mount(); await click("Submit review"); const old = state.presses.get("Submit")!;
  if(kind==="read") props={...props,canRead:false}; if(kind==="write")props={...props,canWrite:false};
  if(kind==="busy")state.busy=true; if(kind==="readiness")state.ready=false; if(kind==="head")state.head="b".repeat(40);
  if(kind==="query-error")state.queryError=Error("Access unavailable"); if(kind==="fetching")state.fetching=true;
  if(kind==="draft")await act(async()=>state.updateDraft!(v=>({...v,body:"Changed summary"})));
  await render(); expect(preflight()).toBeNull(); await act(async()=>old());expect(state.submit).not.toHaveBeenCalled();
  props={...defaults};state.busy=false;state.ready=true;state.head="a".repeat(40);state.queryError=null;state.fetching=false;
  await render();await act(async()=>old());expect(state.submit).not.toHaveBeenCalled();expect(preflight()).toBeNull();
});
it("retires confirmation on unmount",async()=>{
  state.draft={...emptyPrReviewDraft(),commitId:state.head,body:"Summary"};await mount();await click("Submit review");const old=state.presses.get("Submit")!;
  await act(async()=>root.unmount());await act(async()=>old());expect(state.submit).not.toHaveBeenCalled();
});

it.each(["read","project","machine","capability","auth","identity"])("conceals all cached private context across %s loss and restores the unchanged draft", async (kind) => {
  state.draft={...emptyPrReviewDraft(),commitId:state.head,body:"Private summary",comments:[{path:"src/file.ts",side:"LEFT",line:1,body:"Private inline"}]};
  await mount();await click("src/file.ts:LEFT:1");const before=JSON.stringify(state.draft);
  const change=state.changes.get("Review summary")!, refresh=state.presses.get("Refresh diff")!,send=state.presses.get("Submit review")!,bind=state.presses.get("Review current head")!,add=state.presses.get("Comment on this line")!;
  if(kind==="read")props={...props,canRead:false};if(kind==="project")state.project="other";if(kind==="machine")state.active="other";if(kind==="capability")state.supported=false;
  if(kind==="auth"||kind==="identity")state.queryError=Object.assign(Error("Access unavailable"),{kind});
  await render();expect(container.textContent).not.toContain("owner/repo");expect(container.textContent).not.toContain(state.head);expect(container.textContent).not.toContain("src/file.ts");
  expect(container.textContent).not.toContain("−old");expect(container.textContent).not.toContain("+new");expect(container.querySelector('textarea[aria-label="Review summary"]')).toBeNull();expect(container.querySelector('textarea[aria-label="Inline comment"]')).toBeNull();
  expect(state.reads.at(-1)).toBe(kind==="auth"||kind==="identity");
  await act(async()=>{change("Should not replace draft");send();bind();add();refresh();});
  expect(JSON.stringify(state.draft)).toBe(before);expect(state.submit).not.toHaveBeenCalled();expect(state.refetch).toHaveBeenCalledTimes(kind==="auth"||kind==="identity"?1:0);
  props={...defaults};state.project="project";state.active="machine";state.supported=true;state.queryError=null;await render();
  expect((container.querySelector('textarea[aria-label="Review summary"]') as HTMLTextAreaElement).value).toBe("Private summary");
  expect((container.querySelector('textarea[aria-label="Inline comment"]') as HTMLTextAreaElement).value).toBe("Private inline");expect(container.textContent).toContain("src/file.ts");expect(state.reads.at(-1)).toBe(true);
});
it("keeps authorized cached data, focused draft and selection through ordinary network refresh", async()=>{
  state.draft={...emptyPrReviewDraft(),commitId:state.head,body:"Retained summary"};await mount();
  const field=container.querySelector('textarea[aria-label="Review summary"]') as HTMLTextAreaElement;field.focus();field.setSelectionRange(2,7);
  state.queryError=Error("Network unavailable");state.fetching=true;await render();
  expect(container.querySelector('textarea[aria-label="Review summary"]')).toBe(field);expect(document.activeElement).toBe(field);expect([field.selectionStart,field.selectionEnd]).toEqual([2,7]);
  expect(container.textContent).toContain("+new");expect(container.textContent).toContain("src/file.ts");expect(state.reads.at(-1)).toBe(true);
});
it("retains pending receipt recovery while private context is concealed and refuses stale recovery callbacks",async()=>{
  state.draft={...emptyPrReviewDraft(),commitId:state.head,body:"Private summary",pending:{requestId:"pending-review",environmentId:"original-environment"}};
  await mount();const check=state.presses.get("Check review result")!;props={...props,canRead:false};await render();
  expect(container.textContent).toContain("review outcome is unconfirmed");expect(container.querySelector('textarea[aria-label="Review summary"]')).toBeNull();
  await act(async()=>check());expect(state.reconcile).not.toHaveBeenCalled();expect(state.draft.pending?.requestId).toBe("pending-review");
  props={...defaults};await render();await click("Check review result");expect(state.reconcile).toHaveBeenCalledOnce();
});
