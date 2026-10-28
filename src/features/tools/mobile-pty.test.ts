// @vitest-environment happy-dom
import { act, createElement, forwardRef, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { MobilePty } from "./mobile-pty";
const f = vi.hoisted(() => ({
  endpoint: "https://computer.test",
  activeId: "machine",
  raw: null as string | null,
  calls: [] as { method: string; params: Record<string, unknown> }[],
  private: false,
  security: { status: "unlocked", appState: "active", windowFocused: true },
  result: "applied",
  packet:null as null|((packet:Record<string,unknown>)=>void),
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
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
  useHostQuery: () => ({
    data: { terminals: [] },
    isError: f.private,
    error: f.private ? new Error("private") : null,
    refetch: async () => ({ data: { terminals: [] } }),
  }),
  useHostClient: () => ({
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
      return { state: "unknown" };
    },
  }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/theme", () => ({
  useMobileTheme: () => ({
    mode: "dark",
    colors: { background: "#000", text: "#fff", selected: "#123" },
  }),
}));
vi.mock("@/ui/terminal-viewport", () => ({
  TerminalViewport: forwardRef(({onPacket}:{onPacket:(packet:Record<string,unknown>)=>void}) => {f.packet=onPacket;return createElement("div", { "data-viewport": true });}),
}));
vi.mock("@/ui/primitives", () => {
  const box = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const button = ({
    label,
    disabled,
    onPress,
  }: {
    label: string;
    disabled: boolean;
    onPress: () => void;
  }) => createElement("button", { disabled, onClick: onPress }, label);
  return {
    Body: box,
    Row: box,
    Stack: box,
    Disclosure: box,
    Sheet: box,
    Button: button,
    NavigationRow: button,
    Notice: ({ message }: { message: string }) => createElement("p", null, message),
    ErrorText: () => null,
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
