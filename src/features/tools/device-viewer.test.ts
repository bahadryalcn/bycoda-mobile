// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { DeviceViewer } from "./device-viewer";
const state = vi.hoisted(() => ({
  id: "machine",
  writes: [] as { method: string; params: unknown }[],
  refresh: vi.fn(),
  options: undefined as undefined | { interval?: (data?: { mime: string; base64: string; capturedAt: string }) => number },
  finishBoot: undefined as undefined | ((value: unknown) => void),
  deferAction: false,
  finishAction: undefined as undefined | ((value: unknown) => void),
  fields: new Map<string, { value: string; onChangeText(value: string): void }>(),
}));
vi.mock("@/ui/theme", () => ({
  useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }),
}));
vi.mock("lucide-react-native/icons/house", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/ellipsis", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/app-window", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/arrow-left", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/keyboard", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/layers", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/pause", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/play", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/rotate-cw", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/wrench", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("@/state/machines", () => {
  const machine = () => ({ id: state.id, environmentId: "host" });
  const useMachines = Object.assign(() => state.id, {
    getState: () => ({ activeId: state.id, machines: [machine()] }),
    subscribe: () => () => {},
  });
  return { useMachines, useActiveMachine: machine };
});
vi.mock("expo-crypto", () => {
  let id = 0;
  return { randomUUID: () => String(++id) };
});
vi.mock("@/state/queries", () => ({
  useHostQuery: (_key: unknown, _method: string, _params: unknown, options: unknown) => ({
    data: ((state.options = options as typeof state.options), { mime: "image/png", base64: "YWJj", capturedAt: "1" }),
    isFetching: false,
    refetch: state.refresh,
  }),
  useHostMutation: (method: string) => ({
    isPending: false,
    mutateAsync: async (params: unknown) => {
      state.writes.push({ method, params });
      if (method === "devices.boot")
        return new Promise((resolve) => {
          state.finishBoot = resolve;
        });
      if (state.deferAction)
        return new Promise((resolve) => {
          state.finishAction = resolve;
        });
      return "ok";
    },
  }),
}));
// The real store reaches netinfo, which Vitest cannot parse.
vi.mock("@/state/data-saver", () => ({ useDataSaverActive: () => false }));
vi.mock("@/state/query-retry", () => ({ isTransientConnectionError: (error: { kind?: string } | undefined) => error?.kind === "network" }));
vi.mock("@/ui/info-hint", () => ({ useInfoHint: () => ({ button: null, panel: null }) }));
vi.mock("@/ui/copy",() => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/styles", () => ({ uiStyles: {} }));
vi.mock("@/ui/tokens", () => ({ iconSize: { inline: 14, status: 16, row: 20, action: 20, back: 24 }, space: { sm: 8 }, gapIcon: 8, colors: {} }));
vi.mock("./device-runtime", () => ({ DeviceRuntime: () => null }));
vi.mock("./device-preview", () => ({ DevicePreviewSheet: () => null }));
vi.mock("@/ui/overflow-menu", () => ({
  ActionMenu: ({ actions }: { actions: { key: string; label: string; disabled?: boolean; onPress: () => void }[] }) =>
    createElement("div", null, actions.map((item) => createElement("button", { key: item.key, disabled: item.disabled, onClick: item.onPress }, item.label))),
}));
vi.mock("react-native", () => ({ View: ({ children }: PropsWithChildren) => createElement("div", null, children) }));
vi.mock("@/ui/remote-frame", () => ({
  RemoteFrame: ({ onPress }: { onPress: (point: { x: number; y: number }) => void }) =>
    createElement("button", { onClick: () => onPress({ x: 10, y: 20 }) }, "Frame"),
}));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({
    label,
    disabled,
    onPress,
  }: {
    label: string;
    disabled?: boolean;
    onPress: () => void;
  }) => createElement("button", { disabled, onClick: onPress }, label);
  return { ChoiceChip: () => null, FormActions: ({ submitLabel, onSubmit, disabled, feedback }: { submitLabel: string; onSubmit: () => void; disabled?: boolean; feedback?: unknown }) => createElement("div", null, feedback as never, createElement("button", { disabled, onClick: onSubmit }, submitLabel)), StatusText: ({ label }: { label: string }) => createElement("span", null, label),
    NavigationRow: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      disabled?: boolean;
    }) => createElement("button", { onClick: onPress, disabled }, label),
    Body: Wrapper,
    Sheet: ({ children, footer }: PropsWithChildren<{ footer?: unknown }>) => createElement("div", null, children, footer as never),
    Row: Wrapper,
    StatusLine: ({ label, action }: { label: string; action?: { label: string; onPress: () => void } }) => createElement("div", null, label, action ? createElement("button", { onClick: action.onPress }, action.label) : null),
    Loading: () => null,
    StateView: ({ title }: { title: string }) => createElement("span", null, title),
    QueryState: () => null,
    MutationState: () => null,
    Notice: () => null,
    Badge: () => null,
    Field: (props: { label: string; value: string; onChangeText(value: string): void }) => {
      state.fields.set(props.label, props);
      return null;
    },
    Button,
    IconButton: Button,
  };
});
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
const onDevice = vi.fn();
async function render(booted: boolean, extra: { canControl?: boolean; viewOnly?: boolean; starting?: boolean } = {}) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () =>
    root!.render(
      createElement(DeviceViewer, {
        projectId: "project",
        device: {
          id: "device",
          name: "Device",
          platform: "android",
          version: "1",
          booted,
          physical: false,
        },
        canControl: true,
        ...extra,
        onDevice,
        onClose: vi.fn(),
      }),
    ),
  );
}
async function click(label: string) {
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === label)!
      .click(),
  );
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  state.id = "machine";
  state.writes = [];
  state.refresh.mockClear();
  state.finishBoot = undefined;
  state.finishAction = undefined;
  state.deferAction = false;
  state.fields.clear();
  onDevice.mockClear();
  vi.unstubAllGlobals();
});
it("stale machine callbacks cannot capture or control the formerly selected device", async () => {
  await render(true);
  state.id = "other";
  await click("Frame");
  await click("Refresh screen");
  expect(state.writes).toEqual([]);
  expect(state.refresh).not.toHaveBeenCalled();
});
it("late boot completion cannot replace the selected device after a machine switch", async () => {
  await render(false);
  await click("Boot device");
  expect(state.writes).toEqual([
    { method: "devices.boot", params: { projectId: "project", deviceId: "device" } },
  ]);
  state.id = "other";
  await act(async () => state.finishBoot!({ id: "foreign-running-serial", booted: true }));
  expect(onDevice).not.toHaveBeenCalled();
});

it("keeps the start action unavailable when a boot is already tracked by the device list", async () => {
  await render(false, { starting: true });
  expect(container.textContent).toContain("Starting");
  expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Boot device")).toBe(false);
  expect(state.writes).toEqual([]);
});

it("keeps newer device text when an earlier Type text request completes", async () => {
  state.deferAction = true;
  await render(true);
  await click("Type text");
  await act(async () => state.fields.get("Text")!.onChangeText("First text"));
  // The sheet (body) renders before the control bar (footer): the first match is the submit.
  await click("Type text");
  await act(async () => state.fields.get("Text")!.onChangeText("New unsent text"));
  await act(async () => state.finishAction!("ok"));
  expect(state.fields.get("Text")!.value).toBe("New unsent text");
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].params).toEqual({
    projectId: "project",
    deviceId: "device",
    action: { type: "type", text: "First text" },
  });
});
it("Live view slows on identical frames and a refresh or change returns to the base rate", async () => {
  await render(true);
  expect(state.options?.interval).toBeUndefined();
  await click("Live view");
  const poll = state.options!.interval!;
  const still = (index: number) => ({ mime: "image/png", base64: "AAAA", capturedAt: String(index) });
  expect(poll(still(0))).toBe(3_000);
  for (let index = 1; index < 6; index++) poll(still(index));
  expect(poll(still(6))).toBeGreaterThan(3_000);
  expect(poll({ ...still(7), base64: "BBBB" })).toBe(3_000);
  for (let index = 8; index < 14; index++) poll(still(index));
  expect(poll(still(14))).toBeGreaterThan(3_000);
  await click("Refresh screen");
  expect(poll(still(15))).toBe(3_000);
});
it("view-only mode shows the screen without control, tools, boot or the enable-control prompt", async () => {
  await render(true, { canControl: false, viewOnly: true });
  const labels = [...container.querySelectorAll("button")].map((button) => button.textContent);
  expect(labels).toContain("Refresh screen");
  expect(labels).toContain("Live view");
  for (const hidden of ["Control device", "Take control", "Home", "Back", "Recent apps", "Open app", "Type text", "Press element"]) expect(labels).not.toContain(hidden);
  await act(async () => root!.unmount());
  await render(false, { canControl: false, viewOnly: true });
  expect([...container.querySelectorAll("button")].map((button) => button.textContent)).not.toContain("Boot device");
});

it("keeps a device starting only when the start answer was lost or late", async () => {
  const { bootOutcomeUnknown } = await import("./device-viewer");
  expect(bootOutcomeUnknown({ kind: "network" })).toBe(true);
  expect(bootOutcomeUnknown({ kind: "timeout" })).toBe(true);
  expect(bootOutcomeUnknown({ uncertain: true })).toBe(true);
  expect(bootOutcomeUnknown({ kind: "host", message: "No such device" })).toBe(false);
  expect(bootOutcomeUnknown(new Error("emulator failed"))).toBe(false);
});

it("a view-only device without the device tools offers the device service directly", async () => {
  await render(true, { canControl: false });
  expect(container.textContent).toContain("View only. Set up the device tools to tap and type.");
  expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Device service")).toBe(true);
});
