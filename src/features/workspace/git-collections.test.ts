// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fixture = vi.hoisted(() => ({
  history: {} as Record<string, any>, branches: {} as any,
  reads: [] as any[], events: [] as string[], choose: vi.fn(), create: vi.fn(), name: vi.fn(), busy: false,
}));
vi.mock("@/ui/state-view", () => ({ StateView: ({ title, description, action, secondaryAction }: any) => createElement("div", null, title, description, ...[action, secondaryAction].filter(Boolean).map((item: any) => createElement("button", { key: item.label, onClick: item.onPress }, item.label))) }));
vi.mock("@/ui/toast", () => ({ showToast: () => undefined, useToastAvailable: () => false, useSuccessToast: () => () => undefined }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children),
  BackHandler: { addEventListener: () => ({ remove: () => undefined }) } }));
vi.mock("expo-router", () => ({ useFocusEffect: () => undefined, router: { push: () => fixture.events.push("route") } }));
vi.mock("expo-router/react-navigation", () => ({ useIsFocused: () => false }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/i18n", () => ({ useLocale: () => "tr" }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/tokens", () => ({ space: {}, colors: {} }));
vi.mock("@/ui/typography", () => ({ Body: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("@/ui/icon-tile", () => ({ IconTile: () => null }));
vi.mock("lucide-react-native/icons/git-branch", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/check", () => ({ default: () => null }));
vi.mock("./shared", () => ({ rowInset: 16, relativeTime: () => "now", GroupedListRow: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("./git-queries", () => ({ useGitBranches: () => fixture.branches }));
vi.mock("./git-history-queries", () => ({ useGitHistoryRead: (_scope: unknown, read: any) => { fixture.reads.push(read); return fixture.history[read.kind]; } }));
vi.mock("./use-diff-preview", () => ({ useDiffPreview: () => null }));
vi.mock("./git-diff-viewer", () => ({ GitDiffViewer: () => null }));
vi.mock("@/ui/feedback", () => ({
  Empty: ({ title, action }: any) => createElement("div", null, title, action ? createElement("button", { onClick: action.onPress }, action.label) : null),
  Notice: ({ message }: any) => createElement("div", null, message),
  ErrorNotice: ({ error, action }: any) => createElement("div", null, error.message, action ? createElement("button", { onClick: action.onPress }, action.label) : null),
  Loading: () => createElement("div", null, "Loading"), Skeleton: () => createElement("div", null, "Loading"),
}));
vi.mock("lucide-react-native/icons/arrow-left", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/git-branch", () => ({ default: () => null }));
vi.mock("@/ui/primitives", async () => {
  const { QueryState } = await import("@/ui/query-state");
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress, disabled, busy }: any) => createElement("button", { onClick: onPress, disabled: disabled || busy }, label);
  const Input = ({ label, value, onChangeText, ref }: any) => createElement("input", { "aria-label": label, value, ref, onChange: (e: any) => onChangeText(e.target.value) });
  return { QueryState, Body: Group, CodeText: Group, Badge: Group, Row: Group, IconButton: Button, Disclosure: Group, Button, NavigationRow: Button, SearchField: Input, IdentifierField: Input,
    Sheet: ({ children, footer }: any) => createElement("section", null, children, footer),
    ScreenList: ({ header, footer, data, renderItem }: any) => createElement("main", null, createElement("header", null, header),
      createElement("section", null, data.map((item: unknown, index: number) => createElement("div", { key: index }, renderItem({ item, index })))), footer),
    SegmentedControl: ({ options, onChange }: any) => createElement("nav", null, options.map((o: any) => createElement(Button, { key: o.value, label: o.label, onPress: () => onChange(o.value) }))),
  };
});
import { GitHistoryPanel } from "./git-history";
import { GitBranchesPanel } from "./git-branches";
import { RemoteHostError } from "@/remote/host-error";
const commit = { sha: "a".repeat(40), shortSha: "aaaaaaa", subject: "Reviewed change", author: "Developer", timestamp: 1700000000 };
const ok = (data: unknown) => ({ data, isSuccess: true, status: "success" });
const scope = { projectId: "project", root: "/reviewed/worktree" };
let root: ReturnType<typeof createRoot>, container: HTMLDivElement;
const history = () => act(() => root.render(createElement(GitHistoryPanel, { scope, onClose: () => fixture.events.push("close") })));
const branches = () => act(() => root.render(createElement(GitBranchesPanel, { scope, name: "retained draft", onNameChange: fixture.name,
  creating: fixture.busy, onCreate: fixture.create, onChoose: fixture.choose, onClose: () => fixture.events.push("close") })));
const click = async (label: string) => { const b = [...container.querySelectorAll("button")].find((b) => b.textContent === label); expect(b).toBeTruthy(); await act(() => b!.click()); };
const search = async (label: string, value: string) => { const input = container.querySelector(`input[aria-label="${label}"]`)!;
  await act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); };
beforeEach(() => {
  vi.clearAllMocks(); fixture.events = []; fixture.reads = []; fixture.busy = false;
  fixture.history = { history: ok({ commits: [commit] }), files: ok([{ relative: "src/app.ts", status: "modified", additions: 1, deletions: 0 }]),
    diff: ok({ current: "hello", original: "old", binary: false, tooLarge: false, status: "modified" }), blame: ok([]), fileHistory: ok([commit]) };
  fixture.branches = ok({ current: "main", branches: ["feature", "main"], remotes: [{ remote: "origin", name: "main" }] });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });
it("clears a no-match commit filter without changing the loaded request or opening a commit", async () => {
  await history(); await search("Search loaded commits", "missing"); expect(container.textContent).toContain("No commits match your search.");
  await click("Clear search"); expect(document.activeElement).toBe(container.querySelector("input")); expect(container.textContent).toContain("Reviewed change");
  expect(fixture.reads.every((r) => r.kind === "history" && r.limit === 100)).toBe(true); expect(fixture.events).toEqual([]);
});
it("gives cached list and commit-file errors precedence over empty success messages", async () => {
  fixture.history.history = { ...ok({ commits: [] }), error: new Error("Read failed") }; await history();
  expect(container.textContent).toContain("Something went wrong"); expect(container.textContent).not.toContain("No commits found");
  fixture.history.history = ok({ commits: [commit] }); await history(); await click("Reviewed change");
  fixture.history.files = { ...ok([]), error: new Error("Read failed") }; await history();
  expect(container.textContent).toContain("Something went wrong"); expect(container.textContent).not.toContain("No file changes in this commit");
  fixture.history.files = ok([]); await history(); expect(container.textContent).toContain("No file changes in this commit");
});
it("uses the same error-before-empty rule for blame while preserving the immutable revision", async () => {
  await history(); await click("Reviewed change"); await click("app.ts"); await click("Blame");
  expect(container.textContent).toContain("No blame lines");
  fixture.history.blame = { ...ok([]), error: new Error("Read failed") }; await history();
  expect(container.textContent).not.toContain("No blame lines"); expect(container.textContent).toContain("Something went wrong");
  expect(fixture.reads.filter((r) => ["diff", "blame"].includes(r.kind)).every((r) => r.sha === commit.sha && r.path === "src/app.ts")).toBe(true);
});
it("restores branch results without touching the new-branch draft or dispatching Git operations", async () => {
  await branches(); await search("Search", "missing"); expect(container.textContent).toContain("No branches match your search."); await click("Clear search");
  expect(document.activeElement).toBe(container.querySelector('input[aria-label="Search"]'));
  expect(container.textContent).toContain("origin/main"); expect((container.querySelector('input[aria-label="New branch"]') as HTMLInputElement).value).toBe("retained draft");
  expect(fixture.name).not.toHaveBeenCalled(); expect(fixture.choose).not.toHaveBeenCalled(); expect(fixture.create).not.toHaveBeenCalled();
});
it("keeps branch pending/error states distinct and closes before repair without bypassing pending creation", async () => {
  fixture.branches = { data: undefined, status: "pending", fetchStatus: "fetching" }; await branches();
  expect(container.textContent).toContain("Loading"); expect(container.textContent).not.toContain("No branches found.");
  fixture.branches = { ...ok({ branches: [], remotes: [] }), error: new RemoteHostError("machine", "auth", "Pairing needs repair") }; await branches(); await click("Manage connections");
  expect(fixture.events).toEqual(["close", "route"]); expect(container.textContent).not.toContain("No branches found.");
  fixture.events = []; fixture.busy = true; await branches(); await click("Manage connections"); expect(fixture.events).toEqual([]);
});

it("matches Turkish branch and commit names without Git commands", async () => {
  const lower = String.prototype.toLocaleLowerCase;
  vi.spyOn(String.prototype, "toLocaleLowerCase").mockImplementation(function (this: string, locale) { return lower.call(this, locale ?? "en"); });
  fixture.branches = ok({ current: "main", branches: ["main", "İSTANBUL", "IĞDIR"], remotes: [] });
  await branches(); await search("Search", "istanbul"); expect(container.textContent).toContain("İSTANBUL");
  await search("Search", "ığdır"); expect(container.textContent).toContain("IĞDIR");
  await act(() => root.unmount()); root = createRoot(container);
  fixture.history.history = ok({ commits: [{ ...commit, subject: "İSTANBUL düzenlemesi", author: "IĞDIR ekibi" }] });
  await history(); await search("Search loaded commits", "istanbul"); expect(container.textContent).toContain("İSTANBUL düzenlemesi");
  await search("Search loaded commits", "ığdır"); expect(container.textContent).toContain("İSTANBUL düzenlemesi");
  expect(fixture.choose).not.toHaveBeenCalled(); expect(fixture.create).not.toHaveBeenCalled(); expect(fixture.events).toEqual([]);
});
