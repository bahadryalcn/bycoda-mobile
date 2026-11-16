// @vitest-environment jsdom
import { createElement, type PropsWithChildren } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@/ui/layout", () => ({ useScreenChrome: () => ({ nativeTitle: true }) }));
vi.mock("@/ui/screen-list", () => ({
  ScreenList: ({header, footer, data, renderItem}: {header: import("react").ReactNode; footer: import("react").ReactNode; data: unknown[]; renderItem: (item: {item:unknown}) => import("react").ReactNode}) => createElement("div", null, header, data.map(item => renderItem({item})), footer),
}));

vi.mock("@/ui/theme", () => ({ useMobileTheme: vi.fn(() => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} })) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string, args?: Record<string, string>) => en.replace(/\{(\w+)\}/g, (match, key) => args?.[key] ?? match) }));
vi.mock("@/ui/motion", () => ({ enterItem: () => undefined }));
vi.mock("@/ui/tokens", () => ({ colors: {}, metrics: {}, space: {} }));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("@/ui/brand", () => ({ LegalLinks: () => null }));
vi.mock("@/ui/icon-tile", () => ({ IconTile: () => null }));
vi.mock("expo-router", () => ({ router: {}, useLocalSearchParams: () => ({}), Stack: { Screen: ({options}: {options: {gestureEnabled: boolean; headerLeft?: () => import("react").ReactNode}}) => { fixture.options = options; return options.headerLeft?.() ?? null; } } }));
vi.mock("expo-router/react-navigation", () => ({ useIsFocused: () => true }));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
  BackHandler: { addEventListener: (_name: string, callback: () => boolean) => { fixture.hardwareBack = callback; return {remove: () => { if(fixture.hardwareBack === callback) fixture.hardwareBack = null; }}; } },
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: ({ children }: PropsWithChildren) => createElement("div", null, children) },
}));
vi.mock("lucide-react-native/icons/check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-left", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/laptop", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("@/state/security", () => ({ assertAppAccess: vi.fn() }));
vi.mock("../workspace/draft-guard", () => ({ flushWorkspaceDrafts: vi.fn() }));
vi.mock("./recovery", async importOriginal => ({ ...await importOriginal<typeof import("./recovery")>(), reloadSavedConnections: vi.fn(), selectSavedComputer: vi.fn() }));
vi.mock("./account-computers-section", () => ({ AccountComputersSection: ({ others }: { others?: import("react").ReactNode }) => others ?? null }));
vi.mock("./pairing-entry", () => ({ PairingEntry: () => null }));
vi.mock("./pairing-scanner", () => ({ PairingScanner: () => null }));
const fixture = vi.hoisted(() => ({ kind: "choices", adding: false, reset: vi.fn(), remove: vi.fn(),
  busy: false, dirty: false, cancel: vi.fn(), hardwareBack: null as (() => boolean) | null,
  options: undefined as {gestureEnabled:boolean; headerLeft?: () => import("react").ReactNode} | undefined,
  state: { hydrated: true, storageError: null as string | null, connectionPending: false, activeId: "first",
    machines: [{ id: "first", name: "First computer", endpoint: "https://first.invalid" }, { id: "second", name: "Second computer", endpoint: "https://second.invalid" }] },
}));
vi.mock("./use-computer-connection", () => ({
  useComputerConnection: () => ({
    form: { values: { target: fixture.adding ? { kind: "new" } : null }, dirty: fixture.dirty },
    entry: { kind: fixture.kind },
    operation: { reset: fixture.reset },
    recover: async (callback: () => Promise<void>) => { await callback(); },
    busy: fixture.busy, cancel: fixture.cancel,
  }),
}));
vi.mock("@/state/machines", () => ({ useMachines: Object.assign((select?: (state: unknown) => unknown) => (select ? select(fixture.state) : fixture.state), {
  getState: () => ({ ...fixture.state, removeMachine: fixture.remove }),
}) }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Badge: ({ label }: { label: string }) => createElement("span", null, label),
    Body: Wrapper,
    Disclosure: Wrapper,
    NavigationGroup: Wrapper,
    Screen: Wrapper,
    ErrorNotice: () => null,
    Loading: () => null,
    SearchField: () => null,
    QueryState: () => null,
    MutationState: () => createElement("p", null, "Connection error"),
    IconButton: ({label, disabled, onPress}: {label:string; disabled?:boolean; onPress:()=>void}) => createElement("button", {disabled, onClick:onPress}, label),
    HeaderBackButton: ({disabled, onPress}: {disabled?:boolean; onPress:()=>void}) => createElement("button", {disabled, onClick:onPress}, "Back"),
    Button: () => null,
    Sheet: Wrapper, FormActions: ({ submitLabel, disabled, onSubmit, cancelLabel, onCancel }: { submitLabel: string; disabled: boolean; onSubmit: () => void; cancelLabel: string; onCancel: () => void }) => createElement("div", null, createElement("button", { disabled, onClick: onSubmit }, submitLabel), createElement("button", { onClick: onCancel }, cancelLabel)), Notice: ({ message }: { message: string }) => createElement("p", null, message),
    NavigationRow: ({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) =>
      createElement("button", { "aria-pressed": selected, onClick: onPress }, label),
  };
});
import { MachinesScreen } from "./machines-screen";
import { confirmAction } from "@/ui/confirm";

it("owns Back from the initial Add choices, blocks busy exit and restores route gestures on the list", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  const render = () => act(async () => root.render(createElement(MachinesScreen)));
  fixture.adding = true; fixture.kind = "choices"; fixture.cancel.mockClear();
  try {
    await render();
    const back = () => [...container.querySelectorAll("button")].find(item => item.textContent === "Back")!;
    expect(back().disabled).toBe(false);
    expect(fixture.options?.gestureEnabled).toBe(false);
    await act(async () => back().click());
    expect(fixture.cancel).toHaveBeenCalledTimes(1);
    expect(fixture.hardwareBack?.()).toBe(true);
    expect(fixture.cancel).toHaveBeenCalledTimes(2);
    fixture.busy = true; await render();
    expect(back().disabled).toBe(true);
    expect(fixture.hardwareBack?.()).toBe(true);
    expect(fixture.cancel).toHaveBeenCalledTimes(2);
    fixture.busy = false; fixture.dirty = true; await render();
    vi.mocked(confirmAction).mockClear();
    await act(async () => back().click());
    expect(confirmAction).toHaveBeenCalledWith("Unsaved changes", "Discard your unsaved changes?", "Discard changes", fixture.cancel, "Keep editing");
    expect(fixture.cancel).toHaveBeenCalledTimes(2);
    fixture.dirty = false; fixture.adding = false; await render();
    expect(fixture.options?.gestureEnabled).toBe(true);
    expect(fixture.options?.headerLeft).toBeUndefined();
    expect(fixture.hardwareBack).toBeNull();
  } finally { await act(async () => root.unmount()); fixture.adding = false; fixture.busy = false; fixture.dirty = false; vi.unstubAllGlobals(); }
});

it("passes exclusive current-computer selection to the shared accessible row without claiming a live connection", () => {
  const html = renderToStaticMarkup(createElement(MachinesScreen));
  expect(html).toContain('aria-pressed="true">First computer');
  expect(html).toContain('aria-pressed="false">Second computer');
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  expect(html).not.toContain("Connected");
});

it("leaves feedback with manual/preview forms and restores screen fallback outside those forms", () => {
  for (const kind of ["manual", "preview", "paste", "choices"]) {
    fixture.kind = kind;
    fixture.adding = true;
    const html = renderToStaticMarkup(createElement(MachinesScreen));
    expect(html.includes("Connection error")).toBe(!["manual", "preview"].includes(kind));
  }
  fixture.kind = "manual";
  fixture.adding = false;
  expect(renderToStaticMarkup(createElement(MachinesScreen))).toContain("Connection error");
  fixture.kind = "choices";
});


it("keeps removal inside the management sheet and retires review across replacement and return", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  const button = (name: string) => [...container.querySelectorAll("button")].find(item => item.textContent === name)!;
  const render = () => act(async () => root.render(createElement(MachinesScreen)));
  const original = fixture.state.machines[0];
  try {
    await render(); await act(async () => button("First computer").click());
    await act(async () => button("Remove").click());
    expect(container.textContent).toContain("This connection will be removed from this phone. Saved drafts remain.");
    expect(button("Remove").disabled).toBe(false);
    fixture.state.machines = [{ ...original, endpoint: "https://replacement.invalid" }]; await render();
    expect(button("Remove").disabled).toBe(true);
    fixture.state.machines = [original]; await render();
    expect(button("Remove").disabled).toBe(true);
    expect(container.textContent).toContain("Reopen this review");
    await act(async () => button("Cancel").click());
    await act(async () => button("Remove").click());
    expect(button("Remove").disabled).toBe(false);
    await act(async () => button("Remove").click());
    expect(fixture.remove).toHaveBeenCalledExactlyOnceWith("first", { id: "first", endpoint: original.endpoint, environmentId: undefined, lanKey: undefined });
  } finally { await act(async () => root.unmount()); fixture.state.machines = [original, { id: "second", name: "Second computer", endpoint: "https://second.invalid" }]; vi.unstubAllGlobals(); }
});
