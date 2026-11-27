// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { PrReviewFileView } from "./provider-pr-review-file";
import { prDiffFiles } from "./provider-pr-diff-model";

vi.mock("@/ui/copy", () => ({
  useCopy: () => (_tr: string, en: string, params?: Record<string, string | number>) =>
    en.replace(/\{(\w+)\}/g, (key, name: string) => String(params?.[name] ?? key)),
}));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
const guard = vi.hoisted(() => ({ dirty: false }));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null } }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: ({ dirty }: { dirty?: boolean }) => { guard.dirty = !!dirty; return { requestClose: () => {}, requestCloseThen: () => {} }; } }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {}, uiStyles: {} }) }));
vi.mock("./provider-pr-review-summary", () => ({ DiffStats: () => null, prFileStatusLabel: (status: string) => status }));
vi.mock("react-native", async () => {
  const { useEffect } = await import("react");
  type Layout = (event: { nativeEvent: { layout: { width: number; height: number } } }) => void;
  const View = ({ children, accessibilityLabel, onLayout }: PropsWithChildren<{ accessibilityLabel?: string; onLayout?: Layout }>) => {
    useEffect(() => onLayout?.({ nativeEvent: { layout: { width: 320, height: 600 } } }), []);
    return createElement("div", accessibilityLabel ? { "aria-label": accessibilityLabel } : null, children);
  };
  class Value { constructor(public value: number) {} }
  return {
    View,
    Animated: { View, ScrollView: View, Value, event: () => () => {} },
    FlatList: ({ data, renderItem }: { data: unknown[]; renderItem: (row: { item: unknown }) => ReactNode }) =>
      createElement("ol", null, ...data.map((item, index) => createElement("li", { key: index }, renderItem({ item })))),
  };
});
vi.mock("@/ui/primitives", () => {
  const Wrap = ({ children }: PropsWithChildren) => createElement("span", null, children);
  return {
    Body: Wrap, CodeText: Wrap,
    Badge: ({ label }: { label: string }) => createElement("span", null, label),
    StateView: ({ title }: { title: string }) => createElement("p", null, title),
    Screen: ({ children }: PropsWithChildren) => createElement("div", { role: "main" }, children),
    PressableCard: ({ label, onPress, children }: PropsWithChildren<{ label: string; onPress: () => void }>) => createElement("button", { "aria-label": label, onClick: onPress }, children),
    Button: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => createElement("button", { disabled, onClick: onPress }, label),
    Field: ({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) =>
      createElement("textarea", { "aria-label": label, value, onChange: (event: { currentTarget: HTMLTextAreaElement }) => onChangeText(event.currentTarget.value) }),
  };
});

const head = "a".repeat(40);
const [file] = prDiffFiles({
  commitId: head, headOid: head, additions: 1, deletions: 1, truncated: false,
  files: [{ path: "src/file.ts", additions: 1, deletions: 1 }],
  patch: "diff --git a/src/file.ts b/src/file.ts\n--- a/src/file.ts\n+++ b/src/file.ts\n@@ -1,2 +1,2 @@\n keep\n-old\n+new\n",
});
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
const onSave = vi.fn(), onRemove = vi.fn();
async function mount(props: Partial<Parameters<typeof PrReviewFileView>[0]> = {}) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(PrReviewFileView, {
    file: file!, comments: [], commenting: { enabled: true }, onSave, onRemove, onClose: vi.fn(), ...props,
  })));
}
const rows = () => [...container.querySelectorAll("ol > li")];
async function press(selector: string) { await act(async () => (container.querySelector(selector) as HTMLElement).click()); }
async function type(label: string, value: string) {
  await act(async () => {
    const field = container.querySelector(`textarea[aria-label="${label}"]`) as HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
afterEach(async () => { await act(async () => root?.unmount()); container.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("renders the hunk with old/new gutters and opens the composer directly under a tapped line", async () => {
  await mount();
  expect(rows().map((row) => row.textContent)).toEqual(["@@ -1,2 +1,2 @@", "11  keep", "2− old", "2+ new"]);
  await press('button[aria-label^="Old line 2"]');
  const composerAt = rows().findIndex((row) => row.querySelector("textarea"));
  expect(composerAt).toBe(3);
  await type("Comment on old line 2", "Why remove this?");
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Add comment")!.click());
  expect(onSave).toHaveBeenCalledExactlyOnceWith({ side: "LEFT", line: 2 }, "Why remove this?", undefined);
  expect(container.querySelector("textarea")).toBeNull();
});

it("shows pending comments inline and edits or deletes them in place", async () => {
  await mount({ comments: [{ path: "other.ts", side: "RIGHT", line: 2, body: "Elsewhere" }, { path: "src/file.ts", side: "RIGHT", line: 2, body: "Rename" }] });
  expect(rows()[4]?.textContent).toContain("Pending");
  expect(rows()[4]?.textContent).toContain("Rename");
  expect(container.textContent).not.toContain("Elsewhere");
  await press('button[aria-label^="Pending comment"]');
  expect((container.querySelector("textarea") as HTMLTextAreaElement).value).toBe("Rename");
  await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === "Delete comment")!.click());
  expect(onRemove).toHaveBeenCalledExactlyOnceWith(1);
});

it("keeps lines read-only and explains why when comments are unavailable", async () => {
  await mount({ commenting: { enabled: false, reason: "The diff is partial." } });
  expect(container.querySelector('button[aria-label^="Line"]')).toBeNull();
  expect(container.querySelector('button[aria-label^="Old line"]')).toBeNull();
  expect(container.textContent).toContain("The diff is partial.");
});
