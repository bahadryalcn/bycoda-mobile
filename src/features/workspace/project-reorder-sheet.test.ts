// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DirectorySection } from "./project-directory";
import { ProjectReorderSheet } from "./project-reorder-sheet";

type Action = { key: string; label: string; disabled?: boolean; onPress: () => void };
const f = vi.hoisted(() => ({
  menus: new Map<string, readonly Action[]>(),
  cards: new Map<string, () => void>(),
  reorders: [] as unknown[],
}));

// A function declaration, so the hoisted vi.mock factories below can reach it before this line runs.
function box({ children }: PropsWithChildren) { return createElement("div", null, children); }
vi.mock("react-native", () => ({ View: box, Text: box }));
vi.mock("react-native-reanimated", () => ({ default: { ScrollView: box }, useAnimatedRef: () => ({ current: null }) }));
vi.mock("react-native-gesture-handler", () => ({ GestureHandlerRootView: box }));
vi.mock("panelui-native/components/sortable", () => ({
  Sortable: Object.assign(
    ({ children, onReorder }: PropsWithChildren<{ onReorder: unknown }>) => { f.reorders.push(onReorder); return createElement("div", null, children); },
    { Item: box, Handle: ({ accessibilityLabel }: { accessibilityLabel: string }) => createElement("i", { "aria-label": accessibilityLabel }) },
  ),
}));
vi.mock("lucide-react-native/icons/chevron-right", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/arrow-up", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/arrow-down", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/arrow-up-down", () => ({ default: () => null }));
vi.mock("@/ui/tokens", () => ({ gapIcon: 8, metrics: { touchTarget: 48, contentWidth: 640 }, radii: { control: 8 }, space: { row: 12, screen: 16, sm: 8, xs: 4 } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: { raised: "r", muted: "m", accent: "a" }, uiStyles: { label: {}, caption: {} } }) }));
vi.mock("@/ui/sheet-guard", () => ({ useSheetGuard: () => ({ requestCloseThen: (next: () => void) => next() }) }));
vi.mock("@/ui/project-icon", () => ({ ProjectIcon: () => null }));
vi.mock("@/ui/primitives", () => ({
  Sheet: ({ title, children }: PropsWithChildren<{ title: string }>) => createElement("section", { "aria-label": title }, children),
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label),
  NavigationRow: () => null,
  PressableCard: ({ label, onPress, children }: PropsWithChildren<{ label: string; onPress: () => void }>) => {
    f.cards.set(label, onPress);
    return createElement("div", null, children);
  },
  ActionMenu: ({ label, actions }: { label: string; actions: readonly Action[] }) => {
    f.menus.set(label, actions);
    return null;
  },
}));

const project = (id: string) => ({ id, name: id, cwd: `/${id}` }) as DirectorySection["data"][number];
const section = (key: string, ids: string[], name = key): DirectorySection =>
  ({ key, group: { id: key, name }, count: ids.length, total: ids.length, running: 0, expanded: true, data: ids.map(project) }) as unknown as DirectorySection;

const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
const onMove = vi.fn();
async function render(sections: DirectorySection[], grouped: boolean) {
  await act(async () => root.render(createElement(ProjectReorderSheet, {
    visible: true, sections, grouped, othersLabel: "Others", pinnedLabel: "Pinned", onMove, onClose: vi.fn(),
  })));
}
const action = (menu: string, key: "up" | "down") => f.menus.get(menu)!.find((item) => item.key === key)!;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  f.menus.clear();
  f.cards.clear();
  f.reorders.length = 0;
  onMove.mockClear();
  vi.unstubAllGlobals();
});

it("moves a flat project one slot with the same move a drag reports", async () => {
  await render([section("", ["a", "b", "c"])], false);
  act(() => action("Move: b", "up").onPress());
  expect(onMove).toHaveBeenLastCalledWith({ scope: "flat", from: 1, to: 0 });
  act(() => action("Move: b", "down").onPress());
  expect(onMove).toHaveBeenLastCalledWith({ scope: "flat", from: 1, to: 2 });
  expect(onMove).toHaveBeenCalledTimes(2);
});

it("disables Move up at the first slot and Move down at the last and never moves past them", async () => {
  await render([section("", ["a", "b", "c"])], false);
  expect(action("Move: a", "up").disabled).toBe(true);
  expect(action("Move: a", "down").disabled).toBe(false);
  expect(action("Move: c", "down").disabled).toBe(true);
  expect(action("Move: c", "up").disabled).toBe(false);
  act(() => { action("Move: a", "up").onPress(); action("Move: c", "down").onPress(); });
  expect(onMove).not.toHaveBeenCalled();
});

it("moves a single project in place without offering a move", async () => {
  await render([section("", ["only"])], false);
  expect(action("Move: only", "up").disabled).toBe(true);
  expect(action("Move: only", "down").disabled).toBe(true);
});

it("moves groups at the group level and projects inside the opened group scope", async () => {
  await render([section("g1", ["a", "b"], "Alpha"), section("g2", ["c"], "Beta")], true);
  act(() => action("Move: Beta", "up").onPress());
  expect(onMove).toHaveBeenLastCalledWith({ scope: "groups", from: 1, to: 0 });
  expect(action("Move: Alpha", "up").disabled).toBe(true);
  expect(action("Move: Beta", "down").disabled).toBe(true);

  f.menus.clear();
  await act(async () => f.cards.get("Alpha. 2")!());
  act(() => action("Move: a", "down").onPress());
  expect(onMove).toHaveBeenLastCalledWith({ scope: { group: "g1" }, from: 0, to: 1 });
  expect(f.menus.has("Move: Beta")).toBe(false);
});

it("keeps a localized drag handle on every row beside the menu", async () => {
  await render([section("", ["a", "b"])], false);
  expect(container.querySelectorAll('[aria-label="Drag project"]')).toHaveLength(2);
});
