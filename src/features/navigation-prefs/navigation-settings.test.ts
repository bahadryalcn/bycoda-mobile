// @vitest-environment happy-dom
import { act, createElement as h, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { NavigationSettings } from "./navigation-settings";
import { defaultAppPreferences, type AppPreferences } from "./app-preferences";

const fixture = vi.hoisted(() => ({ preferences: undefined as unknown as AppPreferences }));
vi.mock("lucide-react-native/icons/rows-3", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/folder-clock", () => ({ default: () => null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (tr: string) => tr }));
vi.mock("@/ui/preference-storage-notice", () => ({ PreferenceStorageNotice: () => null }));
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
vi.mock("./app-preferences", () => {
  const defaults = {
    tabs: { hidden: [] },
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

it("explains visibility in the app language without offering reordering", async () => {
  const container = await openTabs();
  expect(container.textContent).toContain("Alt çubukta görünecek sekmeleri seç. Ayarlar her zaman görünür.");
  expect(container.textContent).not.toContain("sürükle");
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

it("keeps the last visible tab shown", async () => {
  const container = await openTabs();
  await act(async () => {
    for (const label of ["Projeler", "Oturumlar", "Gelen kutusu", "Araçlar"]) {
      [...container.querySelectorAll("button")].find(button => button.textContent === label)!.click();
    }
  });
  expect(fixture.preferences.tabs.hidden).toEqual(["index", "chats", "inbox"]);
});
