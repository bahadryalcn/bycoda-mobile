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
  useInboxRead: () => ({
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
    refetch: vi.fn(),
    isFetching: false,
  }),
}));
vi.mock("./provider-review-delivery", async () => {
  const { useState } = await import("react");
  return {
    usePrReviewDelivery: () => {
      const [value, update] = useState(state.draft ?? emptyPrReviewDraft());
      return {
        value,
        busy: false,
        error: null,
        submit: state.submit,
        reconcile: vi.fn(),
        draft: {
          ready: true,
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
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Body: Wrap,
    Stack: Wrap,
    Row: Wrap,
    QueryState: () => null,
    Sheet: ({ children, footer }: PropsWithChildren<{ footer?: ReactNode }>) =>
      createElement("div", null, children, footer),
    Notice: ({ message }: { message: string }) => createElement("p", null, message),
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
    }) => createElement("button", { disabled: disabled || busy, onClick: onPress }, label),
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
    }) =>
      createElement("textarea", {
        "aria-label": label,
        value,
        disabled: !editable,
        onChange: (event) => onChangeText((event.currentTarget as HTMLTextAreaElement).value),
      }),
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
const props = {
  item: { provider: "github", kind: "pr", repo: "owner/repo", number: 7, projectPath: "/project" },
  origin: { machineId: "machine", projectId: "project" },
  canRead: true,
  canWrite: true,
  onClose: vi.fn(),
};
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
  expect(state.confirms).toHaveLength(1);
  await act(async () => state.confirms[0]!());
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
    expect(state.confirmBodies).toEqual([
      `owner/repo #7\n${state.head}\n${label}\nReviewed summary\n0 inline comments`,
    ]);
    expect(state.submit).not.toHaveBeenCalled();
    await act(async () => state.confirms[0]!());
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
  await act(async () => state.confirms[0]!());
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
