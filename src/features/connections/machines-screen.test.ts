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
vi.mock("@/ui/tokens", () => ({ colors: {}, metrics: {}, space: {}, iconSize: {} }));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("@/ui/brand", () => ({ LegalLinks: () => null }));
vi.mock("@/ui/icon-tile", () => ({ IconTile: () => null }));
vi.mock("@/ui/machine-bar", () => ({ useMachineStatus: () => ({ phase: "disconnected", status: "Disconnected", reason: "Computer is offline." }) }));
vi.mock("./active-computer-status", () => ({ ActiveComputerStatus: () => createElement("span", null, "Active"), RetryConnectionRow: () => null }));
vi.mock("expo-router", () => ({ router: { canGoBack: () => fixture.canGoBack, canDismiss: () => true, back: fixture.navigate, dismissAll: fixture.navigate, dismissTo: fixture.navigate, replace: fixture.navigate, navigate: fixture.navigate }, useCanGoBack: () => fixture.canGoBack, useLocalSearchParams: () => ({ start: fixture.start, returnToPrevious: fixture.returnToPrevious }), Stack: { Screen: ({options}: {options: {gestureEnabled: boolean; headerLeft?: () => import("react").ReactNode; headerRight?: () => import("react").ReactNode}}) => { fixture.options = options; return createElement("header", null, options.headerLeft?.(), options.headerRight?.()); } } }));
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
vi.mock("lucide-react-native/icons/ellipsis", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/pencil", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/trash-2", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/circle-help", () => ({ default: () => null }));
vi.mock("@/state/security", () => ({ assertAppAccess: vi.fn() }));
vi.mock("../workspace/draft-guard", () => ({ flushWorkspaceDrafts: vi.fn() }));
vi.mock("./recovery", async importOriginal => ({ ...await importOriginal<typeof import("./recovery")>(), reloadSavedConnections: vi.fn() }));
vi.mock("./account-computers-section", () => ({ AccountComputersSection: ({ others }: { others?: import("react").ReactNode }) => others ?? null }));
vi.mock("./pairing-entry", () => ({ PairingEntry: () => createElement("p", null, "Pairing methods") }));
vi.mock("./pairing-scanner", () => ({ PairingScanner: () => null }));
const fixture = vi.hoisted(() => ({ kind: "choices", adding: false, reset: vi.fn(), remove: vi.fn(),
  start: undefined as string | undefined, begin: vi.fn(),
  returnToPrevious: undefined as string | undefined,
  navigate: vi.fn(), canGoBack: false, message: undefined as string | undefined,
  busy: false, dirty: false, cancel: vi.fn(), hardwareBack: null as (() => boolean) | null,
  options: undefined as {gestureEnabled:boolean; headerLeft?: () => import("react").ReactNode} | undefined,
  state: { hydrated: true, storageError: null as string | null, connectionPending: false, activeId: "first",
    machines: [{ id: "first", name: "First computer", endpoint: "https://first.invalid" }, { id: "second", name: "Second computer", endpoint: "https://second.invalid" }] },
}));
vi.mock("./use-computer-connection", () => ({
  useComputerConnection: vi.fn(() => ({
    form: { values: { target: fixture.adding ? { kind: "new" } : null }, dirty: fixture.dirty },
    entry: { kind: fixture.kind },
    operation: { reset: fixture.reset, data: { message: fixture.message } },
    recover: async (callback: () => Promise<void>, message: string) => {
      try { await callback(); fixture.message = message; }
      catch (error) { fixture.message = (error as Error).message; }
    },
    busy: fixture.busy, cancel: fixture.cancel, begin: fixture.begin,
  })),
}));
vi.mock("@/state/machines", () => ({ SAVED_COMPUTERS_LOAD_FAILED: "load", SAVED_COMPUTERS_RECOVERY_FAILED: "recovery", whenConnectionsSettled: async () => undefined, useMachines: Object.assign((select?: (state: unknown) => unknown) => (select ? select(fixture.state) : fixture.state), {
  getState: () => ({ ...fixture.state, removeMachine: fixture.remove, selectMachine: (id: string) => { fixture.state.activeId = id; } }),
}) }));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    StatusText: ({ label }: { label: string }) => createElement("span", null, label),
    SectionHeader: ({ title }: { title: string }) => createElement("h3", null, title),
    RowIcon: () => null,
    Badge: ({ label }: { label: string }) => createElement("span", null, label),
    Body: Wrapper,
    Stack: Wrapper,
    Disclosure: Wrapper,
    NavigationGroup: Wrapper,
    Screen: Wrapper,
    ErrorNotice: () => null,
    Loading: ({ label }: { label: string }) => createElement("p", null, label),
    Skeleton: () => null,
    StateView: ({ title }: { title: string }) => createElement("p", null, title),
    SearchField: () => null,
    useCollapsibleSearch: (field: unknown) => ({ open: true, trigger: null, field }),
    QueryState: () => null,
    MutationState: ({ success }: { success?: string }) => createElement("p", null, success ?? "Connection error"),
    IconButton: ({label, disabled, onPress}: {label:string; disabled?:boolean; onPress:()=>void}) => createElement("button", {disabled, onClick:onPress}, label),
    HeaderBackButton: ({disabled, onPress}: {disabled?:boolean; onPress:()=>void}) => createElement("button", {disabled, onClick:onPress}, "Back"),
    Button: () => null,
    Sheet: Wrapper, FormActions: ({ submitLabel, disabled, onSubmit, cancelLabel, onCancel }: { submitLabel: string; disabled: boolean; onSubmit: () => void; cancelLabel: string; onCancel: () => void }) => createElement("div", null, createElement("button", { disabled, onClick: onSubmit }, submitLabel), createElement("button", { onClick: onCancel }, cancelLabel)), Notice: ({ message }: { message: string }) => createElement("p", null, message),
    NavigationRow: ({ label, detail, accessibilityLabel, selected, onPress, supporting, trailing }: { label: string; detail?: string; accessibilityLabel?: string; selected?: boolean; onPress: () => void; supporting?: PropsWithChildren["children"]; trailing?: PropsWithChildren["children"] }) =>
      createElement("div", null, createElement("button", { "aria-pressed": selected, "aria-label": accessibilityLabel, onClick: onPress }, label, detail), supporting, trailing),
  };
});
import { MachinesScreen } from "./machines-screen";
import { useComputerConnection } from "./use-computer-connection";
import { confirmAction } from "@/ui/confirm";

it("waits for saved connections before presenting the pairing choices", () => {
  const original = fixture.state.machines;
  try {
    fixture.state.machines = [];
    fixture.state.hydrated = false;
    let html = renderToStaticMarkup(createElement(MachinesScreen));
    expect(html).toContain("Loading saved connections…");
    expect(html).not.toContain("Pairing methods");
    fixture.state.hydrated = true;
    fixture.state.storageError = "Unavailable";
    html = renderToStaticMarkup(createElement(MachinesScreen));
    expect(html).toContain("Saved connections are unavailable");
    expect(html).not.toContain("Pairing methods");
    fixture.state.storageError = null;
    expect(renderToStaticMarkup(createElement(MachinesScreen))).toContain("Pairing methods");
  } finally {
    fixture.state.machines = original;
    fixture.state.hydrated = true;
    fixture.state.storageError = null;
  }
});

it("keeps the add action in the header of the saved-computer list", () => {
  const html = renderToStaticMarkup(createElement(MachinesScreen));
  expect(html).toMatch(/<header>.*Add computer.*<\/header>/);
});

it("disambiguates same-name computers and announces the selected computer's connection status", () => {
  const original = fixture.state.machines;
  try {
    fixture.state.machines = [
      { ...original[0], name: "Workshop" },
      { ...original[1], name: "workshop" },
      { id: "unique", name: "Studio", endpoint: "https://studio.invalid" },
    ];
    const html = renderToStaticMarkup(createElement(MachinesScreen));
    expect(html).toContain('aria-label="Workshop. https://first.invalid. Disconnected. Computer is offline."');
    expect(html).toContain("workshophttps://second.invalid");
    expect(html).not.toContain("https://studio.invalid");
  } finally {
    fixture.state.machines = original;
  }
});

it("keeps the computer list visible and returns to a conversation after pairing in recovery", () => {
  fixture.returnToPrevious = "1";
  try {
    expect(renderToStaticMarkup(createElement(MachinesScreen))).toContain("First computer");
    expect(useComputerConnection).toHaveBeenLastCalledWith(true);
  } finally {
    fixture.returnToPrevious = undefined;
  }
  renderToStaticMarkup(createElement(MachinesScreen));
  expect(useComputerConnection).toHaveBeenLastCalledWith(false);
});

it.each(["scan", "paste", "choices"])("opens the linked %s pairing entry only once", async start => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"), root = createRoot(container);
  fixture.start = start; fixture.begin.mockClear();
  try {
    await act(async () => root.render(createElement(MachinesScreen)));
    await act(async () => root.render(createElement(MachinesScreen)));
    expect(fixture.begin).toHaveBeenCalledExactlyOnceWith(start);
  } finally {
    await act(async () => root.unmount()); fixture.start = undefined; vi.unstubAllGlobals();
  }
});

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
  expect(html).toContain('aria-pressed="true" aria-label="First computer. Disconnected. Computer is offline.">First computer</button><span>Active</span>');
  expect(html).toContain('aria-pressed="false">Second computer');
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  expect(html).not.toContain("Connected");
});

it("selects an inactive computer with one tap and shows the new selection without navigating", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.navigate.mockClear();
  const container = document.createElement("div");
  const root = createRoot(container);
  const button = (label: string) => [...container.querySelectorAll("button")].find(item => item.textContent === label);
  try {
    await act(async () => root.render(createElement(MachinesScreen)));
    await act(async () => button("Second computer")!.click());
    expect(fixture.state.activeId).toBe("second");
    expect(button("Use computer")).toBeUndefined();
    await act(async () => root.render(createElement(MachinesScreen)));
    expect(button("First computer")?.getAttribute("aria-pressed")).toBe("false");
    expect(button("Second computer")?.getAttribute("aria-pressed")).toBe("true");
    expect([...container.querySelectorAll("button[aria-pressed]")].map(row => row.textContent))
      .toEqual(["First computer", "Second computer"]);
    expect(button("Second computer")?.parentElement?.textContent).toContain("Active");
    expect(container.textContent).toContain("Computer selected.");
    expect(fixture.options?.headerLeft).toBeUndefined();
    expect(fixture.navigate).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    fixture.state.activeId = "first";
    fixture.message = undefined;
    vi.unstubAllGlobals();
  }
});

it("keeps the shared back button when opened from Settings without a pairing draft", () => {
  fixture.canGoBack = true;
  try {
    expect(renderToStaticMarkup(createElement(MachinesScreen))).toContain(">Back</button>");
  } finally {
    fixture.canGoBack = false;
  }
});

it("leaves feedback with the connection form or rejected code and restores the screen fallback elsewhere", () => {
  for (const kind of ["manual", "preview", "rejected-code", "paste", "choices"]) {
    fixture.kind = kind;
    fixture.adding = true;
    const html = renderToStaticMarkup(createElement(MachinesScreen));
    expect(html.includes("Connection error")).toBe(!["manual", "preview", "rejected-code"].includes(kind));
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
    await render(); await act(async () => button("Options for First computer").click());
    await act(async () => button("Remove").click());
    expect(container.textContent).toContain("This connection will be removed from this phone. Saved drafts remain.");
    expect(button("Remove").disabled).toBe(false);
    // A route change of the same computer keeps the review; a different computer under the same entry retires it.
    fixture.state.machines = [{ ...original, endpoint: "https://tailnet.invalid" }]; await render();
    expect(button("Remove").disabled).toBe(false);
    fixture.state.machines = [{ ...original, environmentId: "replaced" } as typeof original]; await render();
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

it("keeps a removal review valid while its own credential write is pending or rolls back", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = () => act(async () => root.render(createElement(MachinesScreen)));
  const button = (name: string) => [...container.querySelectorAll("button")].find(item => item.textContent === name)!;
  let finishWrite: () => void = () => {};
  fixture.remove.mockImplementationOnce(() => new Promise<void>((_, reject) => {
    fixture.state.connectionPending = true;
    finishWrite = () => {
      fixture.state.connectionPending = false;
      reject(new Error("Credential storage failed"));
    };
  }));
  try {
    await render();
    await act(async () => button("Options for First computer").click());
    await act(async () => button("Remove").click());
    await act(async () => button("Remove").click());
    await render();
    expect(button("Remove").disabled).toBe(true);
    expect(container.textContent).not.toContain("Saved computers changed");

    await act(async () => finishWrite());
    await render();
    expect(button("Remove").disabled).toBe(false);
    expect(container.textContent).not.toContain("Saved computers changed");
  } finally {
    await act(async () => { finishWrite(); root.unmount(); });
    fixture.state.connectionPending = false;
    fixture.message = undefined;
    fixture.remove.mockReset();
    vi.unstubAllGlobals();
  }
});
