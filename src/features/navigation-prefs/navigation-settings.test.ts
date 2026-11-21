// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { NavigationSettings } from "./navigation-settings";
import { defaultAppPreferences, type AppPreferences } from "./app-preferences";

const fixture = vi.hoisted(() => ({ preferences: undefined as unknown as AppPreferences }));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => h("div", null, children), StyleSheet: { hairlineWidth: 1 } }));
vi.mock("react-native-reanimated", () => ({
  default: { ScrollView: ({ children }: PropsWithChildren) => h("div", null, children) },
  useAnimatedRef: () => null,
}));
vi.mock("react-native-gesture-handler", () => ({ GestureHandlerRootView: ({ children }: PropsWithChildren) => h("div", null, children) }));
vi.mock("lucide-react-native/icons/rows-3", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/folder-clock", () => ({ default: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (tr: string) => tr }));
vi.mock("@/ui/preference-storage-notice", () => ({ PreferenceStorageNotice: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("@/ui/tokens", () => ({ gapIcon: 4, metrics: {}, space: {} }));
vi.mock("@/ui/primitives", () => {
  const wrap = ({ children }: PropsWithChildren) => h("div", null, children);
  const command = ({ label, onPress }: { label: string; onPress: () => void }) => h("button", { onClick: onPress }, label);
  return {
    Body: wrap, Button: command, NavigationGroup: wrap, NavigationRow: command,
    SettingIcon: () => null, Sheet: wrap, Stack: wrap,
    ToggleField: ({ label, onChange }: { label: string; onChange: (shown: boolean) => void }) =>
      h("button", { onClick: () => onChange(false) }, label),
  };
});
vi.mock("panelui-native/components/sortable", () => {
  const wrap = ({ children }: PropsWithChildren) => h("div", null, children);
  const handle = ({ accessibilityLabel, accessibilityValue, accessibilityActions, onAccessibilityAction }: {
    accessibilityLabel: string;
    accessibilityValue?: { min: number; max: number; now: number };
    accessibilityActions?: { label?: string }[];
    onAccessibilityAction?: (event: { nativeEvent: { actionName: string } }) => void;
  }) => h("span", {
    "data-handle": accessibilityLabel,
    "data-value": JSON.stringify(accessibilityValue),
    "data-actions": accessibilityActions?.flatMap(action => action.label ?? []).join(", "),
    onClick: () => onAccessibilityAction?.({ nativeEvent: { actionName: "increment" } }),
  });
  return { Sortable: Object.assign(wrap, { Item: wrap, Handle: handle }) };
});
vi.mock("./app-preferences", () => {
  const defaults = {
    tabs: { order: ["index", "chats", "inbox", "manage"], hidden: [] },
    groupByRepository: false, newSessionUsesLastProject: false,
  };
  return {
    defaultAppPreferences: defaults,
    useAppPreferences: () => ({ hydrated: true, preferences: fixture.preferences }),
    appPreferences: { getState: () => ({
      update: async (patch: Partial<AppPreferences> | ((current: AppPreferences) => Partial<AppPreferences>)) => {
        fixture.preferences = { ...fixture.preferences, ...(typeof patch === "function" ? patch(fixture.preferences) : patch) };
      },
    }) },
  };
});

let root: ReturnType<typeof createRoot> | undefined;
afterEach(() => { act(() => root?.unmount()); root = undefined; vi.unstubAllGlobals(); });

async function openTabs() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.preferences = defaultAppPreferences;
  const container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root!.render(h(NavigationSettings)));
  await act(async () => container.querySelector("button")!.click());
  return container;
}

it("explains visibility and reordering without assuming where tabs appear", async () => {
  const container = await openTabs();
  expect(container.textContent).toContain("Görünecek sekmeleri seç. Sıralamak için tutamaçları sürükle.");
});

it("gives screen readers numeric tab positions and labels in the app language", async () => {
  const container = await openTabs();
  const handle = container.querySelector('[data-handle="Projeler, Sekmeyi sürükle"]');
  expect(JSON.parse(handle?.getAttribute("data-value") ?? "null")).toEqual({ min: 1, max: 4, now: 1 });
  expect(handle?.getAttribute("data-actions")).toBe("Aşağı taşı");
  const last = container.querySelector('[data-handle="Araçlar, Sekmeyi sürükle"]');
  expect(last?.getAttribute("data-actions")).toBe("Yukarı taşı");
});

it("keeps both visibility changes made before a fresh render", async () => {
  const container = await openTabs();
  await act(async () => {
    for (const label of ["Projeler", "Oturumlar"]) {
      [...container.querySelectorAll("button")].find(button => button.textContent === label)!.click();
    }
  });
  expect(fixture.preferences.tabs.hidden).toEqual(["index", "chats"]);
});

it("moves an incremented tab later from its latest saved position", async () => {
  const container = await openTabs();
  const handle = container.querySelector<HTMLElement>('[data-handle="Projeler, Sekmeyi sürükle"]');
  await act(async () => { handle!.click(); handle!.click(); });
  expect(fixture.preferences.tabs.order).toEqual(["chats", "inbox", "index", "manage"]);
});
