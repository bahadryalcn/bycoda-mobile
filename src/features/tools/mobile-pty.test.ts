// @vitest-environment happy-dom
import { act, createElement, forwardRef, useImperativeHandle, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { MobilePty } from "./mobile-pty";
import type { TerminalViewportHandle } from "@/ui/terminal-viewport";
const f = vi.hoisted(() => ({
  endpoint: "https://computer.test",
  activeId: "machine",
  raw: null as string | null,
  calls: [] as { method: string; params: Record<string, unknown> }[],
  private: false,
  security: { status: "unlocked", appState: "active", windowFocused: true },
  result: "applied",
  closeConfirmed: false,
  listError: null as Error | null,
  listReady: true,
  listEnabled: false,
  clientReady: true,
  offline: false,
  refetchList: vi.fn(async (_options?: { cancelRefetch: boolean }) => ({ data: { terminals: [] } })),
  keyboardVisible: false,
  hideKeyboard: vi.fn(),
  attachOutput: vi.fn(),
  showToast: vi.fn(),
  packet:null as null|((packet:Record<string,unknown>)=>void),
}));
vi.mock("./mobile-pty-attach", () => ({ attachTerminalOutput: f.attachOutput }));
vi.mock("@/state/device-network", () => ({ deviceIsOffline: () => f.offline, useDeviceOffline: () => f.offline }));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
  ScrollView: ({ children, horizontal, accessibilityLabel, fadingEdgeLength }: PropsWithChildren<{
    horizontal?: boolean;
    accessibilityLabel?: string;
    fadingEdgeLength?: number;
  }>) => createElement("div", {
    "aria-label": accessibilityLabel,
    "data-horizontal": horizontal,
    "data-fading-edge": fadingEdgeLength,
  }, children),
  Modal: ({ children }: PropsWithChildren) => createElement("div", { "data-native-modal": true }, children),
}));
vi.mock("@/ui/overlays", () => ({
  ScreenOverlay: ({ children, label, onClose }: PropsWithChildren<{ label: string; onClose: () => void }>) =>
    createElement("section", { "aria-label": label }, createElement("button", { onClick: onClose }, "System back"), children),
}));
vi.mock("react-native-keyboard-controller", () => ({
  KeyboardAvoidingView: ({ children }: PropsWithChildren) => createElement("div", null, children),
  KeyboardController: { dismiss: async () => {} },
  useReanimatedKeyboardAnimation: () => ({ progress: { value: 0 } }),
  useKeyboardState: (select: (state: { isVisible: boolean }) => unknown) => select({ isVisible: f.keyboardVisible }),
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: ({ children }: PropsWithChildren) => createElement("div", null, children) },
  useAnimatedStyle: () => ({}),
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("@/ui/tokens", () => ({ metrics: { touchTarget: 48 }, space: { xs: 4, sm: 6, lg: 16, screen: 16 } }));
vi.mock("lucide-react-native/icons/keyboard", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-up", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-down", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-left", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/chevron-right", () => ({ default: () => null }));
vi.mock("expo-crypto", () => ({
  randomUUID: () => "operation",
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async (_kind: string, text: string) =>
    (await import("node:crypto")).createHash("sha256").update(text).digest("hex"),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async () => f.raw,
    setItem: async (_key: string, value: string) => {
      f.raw = value;
    },
    removeItem: async () => {
      f.raw = null;
    },
  },
}));
vi.mock("@/state/security", () => ({
  useSecurity: Object.assign(
    (selector: (state: typeof f.security) => unknown) => selector(f.security),
    { getState: () => f.security },
  ),
}));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({
    id: "machine",
    name: "Computer",
    environmentId: "env",
    endpoint: f.endpoint,
    lanKey: "key",
    capabilities: ["terminals.pty.desktop.v1"],
  }),
  useMachines: {
    getState: () => ({
      activeId: f.activeId,
      machines: [{ id: "machine", environmentId: "env", endpoint: f.endpoint, lanKey: "key" }],
    }),
  },
}));
vi.mock("@/state/queries", () => ({
  useHostQuery: (_key: unknown, _method: string, _params: unknown, options: { enabled: boolean }) => {
    f.listEnabled = options.enabled;
    return {
      data: f.listReady ? { terminals: [] } : undefined,
      isError: f.private || !!f.listError,
      error: f.private ? new Error("private") : f.listError,
      refetch: f.refetchList,
    };
  },
  useHostClient: () => f.clientReady ? ({
    request: async (method: string, params: Record<string, unknown>) => {
      f.calls.push({ method, params });
      if (method === "terminals.pty.desktop.create") {
        expect(f.raw).toContain('"operationId":"operation"');
        if (f.result === "unknown") return { state: "unknown" };
        return {
          terminal: {
            terminalId: "sealed-id",
            epoch: "sealed-epoch",
            sourceSessionId: "source",
            name: "Mobile terminal",
            shell: "default",
            state: "running",
            cols: 80,
            rows: 24,
            exitCode: null,
            control: "mobile",
            replayStart: 0,
            replayEnd: 0,
          },
          leaseId: "sealed-lease",
          expiresAt: Date.now() + 30000,
        };
      }
      if (method === "terminals.pty.desktop.close" || method === "terminals.pty.desktop.status") return f.closeConfirmed ? { closed: true } : { state: "unknown" };
      return { state: "unknown" };
    },
  }) : null,
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({
  useMobileTheme: () => ({
    mode: "dark",
    colors: { border: "#222", background: "#000", text: "#fff", selected: "#123", accent: "#00f", muted: "#888", danger: "#f00" },
  }),
}));
vi.mock("lucide-react-native/icons/play", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/trash-2", () => ({ default: () => null }));
vi.mock("@/ui/terminal-viewport", () => ({
  TerminalViewport: forwardRef<TerminalViewportHandle, { onPacket: (packet: Record<string, unknown>) => void }>(
    ({ onPacket }, ref) => {
      useImperativeHandle(ref, () => ({ post: () => {}, focusInput: () => {}, hideInput: f.hideKeyboard }));
      f.packet = onPacket;
      return createElement("div", { "data-viewport": true });
    },
  ),
}));
vi.mock("@/ui/primitives", () => {
  const box = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const button = ({
    label,
    disabled,
    onPress,
    reserveTouchTarget,
  }: {
    label: string;
    disabled: boolean;
    onPress: () => void;
    reserveTouchTarget?: boolean;
  }) => createElement("button", { disabled, onClick: onPress, "data-touch-target": reserveTouchTarget }, label);
  return {
    Body: box,
    Heading: box,
    HeaderBackButton: ({ onPress }: { onPress: () => void }) => createElement("button", { onClick: onPress }, "Back"),
    ActionMenu: ({ label, actions, onTriggerPress }: { label: string; actions: ({ label: string; disabled?: boolean; onPress: () => void } | false)[]; onTriggerPress?: () => void }) =>
      createElement("div", { "data-action-menu": true }, createElement("button", { onClick: onTriggerPress }, label), ...actions.filter(Boolean).map((a) =>
        createElement("button", { disabled: a && a.disabled, onClick: a && a.onPress }, a && a.label))),
    Row: box,
    Stack: box,
    Disclosure: box,
    Sheet: box,
    Button: button,
    IconButton: button,
    Loading: ({ label }: { label: string }) => createElement("p", null, label),
    NavigationRow: button,
    StateView: ({ title, description, action }: { title: string; description?: string; action?: { label: string; onPress: () => void; reserveTouchTarget?: boolean } }) =>
      createElement("div", null, title, description, action ? createElement(button, { ...action, disabled: false }) : null),
    Notice: ({ message }: { message: string }) => createElement("p", null, message),
    showToast: f.showToast,
    ErrorText: ({ error, message }: { error: unknown; message?: string }) => error ? createElement("p", null, message ?? String(error)) : null,
    ScreenList: ({
      data,
      header,
      renderItem,
    }: {
      data: unknown[];
      header: unknown;
      renderItem: (value: { item: unknown }) => unknown;
    }) =>
      createElement(
        "div",
        null,
        header as never,
        ...data.map((item) => renderItem({ item }) as never),
      ),
  };
});
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
const props = {
  scope: { machineId: "machine", sessionId: "source" },
  projectId: "project",
  onClose: vi.fn(),
};
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  await act(async () => root.render(createElement(MobilePty, props)));
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
  vi.unstubAllGlobals();
  f.calls = [];
  f.raw = null;
  f.endpoint = "https://computer.test";
  f.activeId = "machine";
  f.private = false;
  f.security = { status: "unlocked", appState: "active", windowFocused: true };
  f.result = "applied";
  f.closeConfirmed = false;
  f.listError = null;
  f.listReady = true;
  f.listEnabled = false;
  f.clientReady = true;
  f.offline = false;
  f.refetchList.mockClear();
  f.keyboardVisible = false;
  f.hideKeyboard.mockClear();
  f.attachOutput.mockReset();
  f.showToast.mockClear();
  props.onClose.mockClear();
});

const desktopOffline = "Desktop relay is offline. Open the updated bycoda desktop connected to this host.";

it("waits for the network even when the terminal list was already loaded", async () => {
  await mount();
  const create = () => [...container.querySelectorAll("button")].find(button => button.textContent === "New interactive terminal");
  expect(create()?.disabled).toBe(false);
  f.offline = true;
  await act(async () => create()!.click());
  expect(f.calls).toEqual([]);
  expect(f.raw).toBeNull();
  await act(async () => root.render(createElement(MobilePty, props)));
  expect(f.listEnabled).toBe(false);
  expect(container.textContent).toContain("Waiting for a connection.");
  expect(create()).toBeUndefined();
  f.offline = false;
  await act(async () => root.render(createElement(MobilePty, props)));
  expect(f.listEnabled).toBe(true);
  expect(create()?.disabled).toBe(false);
});

it("replaces the disabled create action with a waiting state until the terminal list is available", async () => {
  f.security.windowFocused = false;
  f.listReady = false;
  await mount();
  expect(f.listEnabled).toBe(false);
  expect(container.textContent).toContain("Waiting for a connection. Loading will resume when it returns.");
  expect(container.textContent).not.toContain("New interactive terminal");
  expect(f.raw).toBeNull();

  f.security.windowFocused = true;
  f.clientReady = false;
  await act(async () => root.render(createElement(MobilePty, props)));
  expect(f.listEnabled).toBe(false);
  expect(container.textContent).not.toContain("New interactive terminal");

  f.clientReady = true;
  await act(async () => root.render(createElement(MobilePty, props)));
  expect(f.listEnabled).toBe(true);
  expect(container.textContent).not.toContain("New interactive terminal");

  f.listReady = true;
  await act(async () => root.render(createElement(MobilePty, props)));
  expect(container.textContent).not.toContain("Waiting for a connection.");
  const create = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "New interactive terminal");
  expect(create?.disabled).toBe(false);
  expect(f.raw).toBeNull();
  expect(f.calls).toEqual([]);
});

it("explains the offline desktop and retries only the terminal list", async () => {
  f.listError = new Error(desktopOffline);
  await mount();
  expect(container.textContent).toContain("Open bycoda on the connected computer, then retry.");
  expect(container.textContent).not.toContain("New interactive terminal");
  const retry = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === "Retry")!;
  expect(retry.dataset.touchTarget).toBe("true");
  await act(async () => { retry.click(); retry.click(); });
  expect(f.refetchList).toHaveBeenCalledExactlyOnceWith({ cancelRefetch: false });
  expect(f.calls).toEqual([]);
  f.listError = null;
  await act(async () => root.render(createElement(MobilePty, props)));
  expect(container.textContent).not.toContain("Desktop app unavailable");
  expect(container.textContent).toContain("New interactive terminal");
});

it("does not retry the list from a stale mounted action after the computer changes", async () => {
  f.listError = new Error(desktopOffline);
  await mount();
  f.endpoint = "https://replacement.test";
  await click("Retry");
  expect(f.refetchList).not.toHaveBeenCalled();
  expect(f.calls).toEqual([]);
});

it("does not replay or clear an uncertain creation while retrying the list", async () => {
  f.result = "unknown";
  await mount();
  await click("New interactive terminal");
  const receipt = f.raw;
  expect(receipt).toContain("operation");
  f.listError = new Error(desktopOffline);
  await act(async () => root.render(createElement(MobilePty, props)));
  await click("Retry");
  expect(f.calls.map((call) => call.method)).toEqual(["terminals.pty.desktop.create"]);
  expect(f.raw).toBe(receipt);
});

it("puts Terminal actions in the shared screen layer and Back leaves without closing the PTY", async () => {
  await mount();
  const layer = container.querySelector('section[aria-label="Terminal"]');
  expect(layer).not.toBeNull();
  expect(container.querySelector("[data-native-modal]")).toBeNull();
  expect(layer?.textContent).toContain("New interactive terminal");
  await click("New interactive terminal");
  expect(layer?.textContent).toContain("Close terminal");
  await click("System back");
  expect(props.onClose).toHaveBeenCalledOnce();
  expect(f.calls.map((call) => call.method)).toEqual(["terminals.pty.desktop.create"]);
});

it("keeps all seven terminal keys reachable in a scrolling row with reserved touch targets", async () => {
  f.keyboardVisible = true;
  await mount();
  await click("New interactive terminal");
  const row = container.querySelector('[aria-label="Terminal keys"][data-horizontal="true"]');
  expect(Number(row?.getAttribute("data-fading-edge"))).toBeGreaterThan(0);
  const keys = Array.from(row?.querySelectorAll("button") ?? []);
  expect(keys.map((key) => key.textContent)).toEqual(["Esc", "Tab", "Ctrl-C", "Arrow left", "Arrow down", "Arrow up", "Arrow right"]);
  expect(keys.every((key) => key.dataset.touchTarget === "true")).toBe(true);
});

it("keeps the keyboard toggle in the fixed terminal header while Gboard is open", async () => {
  f.keyboardVisible = true;
  await mount();
  await click("New interactive terminal");
  const buttons = Array.from(container.querySelectorAll("button"));
  const hide = buttons.find((button) => button.textContent === "Hide keyboard");
  expect(hide?.dataset.touchTarget).toBe("true");
  expect(hide?.parentElement?.textContent).toContain("Close terminal");
  await click("Hide keyboard");
  expect(f.hideKeyboard).toHaveBeenCalledOnce();
  expect(props.onClose).not.toHaveBeenCalled();
});

it("keeps Attach output in Terminal actions and protects the draft from a duplicate tap", async () => {
  f.keyboardVisible = true;
  await mount();
  await click("New interactive terminal");
  await click("Terminal actions");
  expect(f.hideKeyboard).toHaveBeenCalledOnce();
  expect(container.querySelector("[data-action-menu]")?.textContent).toContain("Attach output");
  expect([...container.querySelectorAll("button")].filter((button) => button.textContent === "Attach output")).toHaveLength(1);
  f.attachOutput.mockImplementationOnce(() => { throw new Error("There is no terminal output to attach yet."); });
  await click("Attach output");
  expect(container.textContent).toContain("There is no terminal output to attach yet.");
  await click("Attach output");
  expect(f.showToast).toHaveBeenCalledWith({ message: "Added to draft" });
  expect(container.textContent).not.toContain("There is no terminal output to attach yet.");
  const attached = [...container.querySelectorAll<HTMLButtonElement>("[data-action-menu] button")].find((button) => button.textContent === "Added to draft");
  expect(attached?.disabled).toBe(true);
  await click("Added to draft");
  expect(f.attachOutput).toHaveBeenCalledTimes(2);
});

it("retains its terminal after unknown close and checks the original receipt without replaying close", async () => {
  await mount();
  await click("New interactive terminal");
  expect(container.querySelector("[data-viewport]")).not.toBeNull();
  await click("Close terminal");
  expect(container.querySelector("[data-viewport]")).not.toBeNull();
  expect(container.textContent).toContain("Terminal closure is not confirmed");
  const close = f.calls.find(call => call.method === "terminals.pty.desktop.close")!;
  expect(close).toBeDefined();
  await click("Check status");
  expect(container.querySelector("[data-viewport]")).not.toBeNull();
  f.closeConfirmed = true;
  await click("Check status");
  expect(f.calls.filter(call => call.method === "terminals.pty.desktop.close")).toHaveLength(1);
  const status = f.calls.find(call => call.method === "terminals.pty.desktop.status")!;
  expect(status.params.requestId).toBe(close.params.requestId);
  expect(f.calls.filter(call => call.method === "terminals.pty.desktop.status").every(call => call.params.requestId === close.params.requestId)).toBe(true);
  expect(container.querySelector("[data-viewport]")).toBeNull();
});
it("opening does not create or send input; explicit create claims a durable request first", async () => {
  await mount();
  expect(f.calls).toEqual([]);
  await click("New interactive terminal");
  expect(f.calls).toHaveLength(1);
  expect(f.calls[0]).toMatchObject({
    method: "terminals.pty.desktop.create",
    params: {
      sessionId: "source",
      projectId: "project",
      requestId: "operation",
      cols: 80,
      rows: 24,
    },
  });
  expect(f.raw).toBeNull();
});
it("unknown create persists identity and opening again does not retry it", async () => {
  f.result = "unknown";
  await mount();
  await click("New interactive terminal");
  expect(f.raw).toContain("operation");
  expect(f.calls).toHaveLength(1);
  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => root.render(createElement(MobilePty, props)));
  expect(f.calls).toHaveLength(1);
  expect(
    [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "New interactive terminal",
    )?.disabled,
  ).toBe(true);
});
it("same-id changed endpoint cannot create, and privacy hides an already opened renderer", async () => {
  await mount();
  f.endpoint = "https://other.test";
  await click("New interactive terminal");
  expect(f.calls).toEqual([]);
  expect(f.raw).toBeNull();
  f.endpoint = "https://computer.test";
  await act(async () => root.render(createElement(MobilePty, props)));
  await click("New interactive terminal");
  expect(container.querySelector("[data-viewport]")).not.toBeNull();
  f.private = true;
  await act(async () => root.render(createElement(MobilePty, props)));
  expect(container.querySelector("[data-viewport]")).toBeNull();
});
it.each(["locked", "suspended"])("renders no terminal while the app is %s", async (status) => {
  await mount();
  expect(container.textContent).not.toBe("");
  f.security.status = status;
  await act(async () => root.render(createElement(MobilePty, props)));
  expect(container.textContent).toBe("");
});
it("background state forbids mutation even before a rerender", async () => {
  await mount();
  f.security.appState = "background";
  await click("New interactive terminal");
  expect(f.calls).toEqual([]);
});
it("reopened unknown creation refuses status after the same machine was re-paired to a different endpoint", async () => {
  f.result = "unknown";
  await mount();
  await click("New interactive terminal");
  expect(f.raw).toContain("targetIdentityDigest");
  await act(async () => root.unmount());
  f.endpoint = "https://replacement.test";
  root = createRoot(container);
  await act(async () => root.render(createElement(MobilePty, props)));
  expect(
    [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Check creation status",
    )?.disabled,
  ).toBe(true);
  expect(f.calls).toHaveLength(1);
});
it("a second renderer-ready event latches screen loss and disables protocol input",async()=>{
 await mount();await click("New interactive terminal");await act(async()=>{f.packet?.({type:"ready",cols:80,rows:24});f.packet?.({type:"ready",cols:80,rows:24});});
 expect([...container.querySelectorAll("button")].find(button=>button.textContent==="Ctrl-C")?.disabled).toBe(true);expect(f.calls.every(call=>call.method!=="terminals.pty.desktop.write")).toBe(true);
});
it("shows a loading state over the terminal until the renderer is ready", async () => {
  await mount();
  await click("New interactive terminal");
  expect(container.textContent).toContain("Opening terminal…");
  expect(container.textContent).not.toContain("Real PTY requires");
  await act(async () => f.packet?.({ type: "ready", cols: 80, rows: 24 }));
  expect(container.textContent).not.toContain("Opening terminal…");
});
