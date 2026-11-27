// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SshWorkspace } from "./ssh-workspace";
const f = vi.hoisted(() => ({
  data: new Map<string, string>(),
  activeId: "machine",
  endpoint: "https://fixture",
  request: vi.fn(),
  seq: 0,
  failSave: false,
  onSave: undefined as undefined | (() => void),
  onHash: undefined as undefined | (() => void),
  security: { status: "unlocked", appState: "active", windowFocused: true },
}));
const connection = {
  id: "saved",
  name: "Fixture",
  host: "fixture.invalid",
  port: 22,
  hasIdentity: true,
  hasJump: false,
  hasProxy: false,
};
const review = {
  reviewId: "v1." + "a".repeat(97),
  expiresAt: Date.now() + 120000,
  operation: "connect",
  connection,
  configurationDigest: "a".repeat(64),
  terminalCount: 1,
  nativeApprovalRequired: true,
  phoneTerminal: false,
};
const catalog = {
  connections: [connection],
  phoneTerminal: false,
  sftp: false,
  forwards: false,
  runbooks: false,
};
vi.mock("expo-crypto", async () => {
  const { createHash } = await import("node:crypto");
  return {
    randomUUID: () => `request-${++f.seq}`,
    digestStringAsync: async (_algorithm: string, value: string) => {
      f.onHash?.();
      return createHash("sha256").update(value).digest("hex");
    },
    CryptoDigestAlgorithm: { SHA256: "SHA256" },
  };
});
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => f.data.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      if (f.failSave) throw new Error("Storage failed");
      f.data.set(key, value);
      f.onSave?.();
    },
    removeItem: async (key: string) => {
      f.data.delete(key);
    },
  },
}));
vi.mock("@/state/security", () => ({
  useSecurity: Object.assign(
    (select: (value: typeof f.security) => unknown) => select(f.security),
    { getState: () => f.security },
  ),
  isAppAccessAllowed: () => f.security.status === "unlocked",
}));
vi.mock("@/state/machines", () => {
  const machine = () => ({
    id: "machine",
    environmentId: "env",
    endpoint: f.endpoint,
    lanKey: "fixture",
    capabilities: ["ssh.workspace.desktop.v1"],
  });
  return {
    useActiveMachine: machine,
    useMachines: { getState: () => ({ activeId: f.activeId, machines: [machine()] }) },
  };
});
vi.mock("@/state/queries", () => ({ useHostClient: () => ({ request: f.request }) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/confirm", () => ({ confirmAction: vi.fn() }));
vi.mock("@/ui/info-hint", () => ({ useInfoHint: () => ({ button: null, panel: null }) }));
vi.mock("@/ui/primitives", () => {
  const wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return { ScopeLine: () => null,
    FormActions: ({ submitLabel, onSubmit, disabled, busy, feedback }: { submitLabel: string; onSubmit: () => void; disabled?: boolean; busy?: boolean; feedback?: import("react").ReactNode }) => createElement("div", null, feedback, createElement("button", { disabled: disabled || busy, onClick: onSubmit }, submitLabel)),
    Sheet: wrapper,
    Row: wrapper,
    Body: wrapper,
    Notice: ({ message }: { message: string }) => createElement("div", null, message),
    ErrorText: () => null,
    Button: ({
      label,
      disabled,
      onPress,
    }: {
      label: string;
      disabled: boolean;
      onPress: () => void;
    }) => createElement("button", { disabled, onClick: onPress }, label),
    SelectField: ({ onChange }: { onChange: (value: string) => void }) =>
      createElement("button", { onClick: () => onChange("saved") }, "Choose fixture"),
  };
});
let root: ReturnType<typeof createRoot>;
const container = document.createElement("div");
async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(SshWorkspace, {
        scope: { machineId: "machine", sessionId: "source" },
        projectId: "project",
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
async function openReview() {
  await mount();
  await click("Get SSH servers");
  await click("Choose fixture");
  await click("Review connection");
}
afterEach(async () => {
  await act(async () => root?.unmount());
  f.data.clear();
  f.activeId = "machine";
  f.endpoint = "https://fixture";
  f.seq = 0;
  f.failSave = false;
  f.onHash = undefined;
  f.onSave = undefined;
  f.security = { status: "unlocked", appState: "active", windowFocused: true };
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("expires an idle review visibly and requests a fresh exact-target review without claiming or approving", async () => {
  vi.useFakeTimers();
  f.request.mockImplementation(async (method: string) => {
    if (method.endsWith("catalog.read")) return catalog;
    return { ...review, expiresAt: Date.now() + 1000 };
  });
  await openReview();
  await act(async () => vi.advanceTimersByTime(1000));
  expect(container.textContent).toContain("This SSH review expired. Review it again to continue.");
  const approval = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Request computer approval",
  )!;
  expect(approval.disabled).toBe(true);
  await click("Request computer approval");
  expect(f.data.size).toBe(0);
  expect(f.request.mock.calls.some(([method]) => method.endsWith("approve"))).toBe(false);
  await click("Review again");
  expect(f.request).toHaveBeenLastCalledWith(
    "ssh.workspace.review",
    {
      projectId: "project",
      sessionId: "source",
      connectionId: "saved",
    },
    expect.any(Object),
  );
  expect(container.textContent).not.toContain("This SSH review expired.");
  expect(f.data.size).toBe(0);
});

it("rechecks review expiry after returning to foreground and after asynchronous hashing", async () => {
  vi.useFakeTimers();
  f.request.mockImplementation(async (method: string) =>
    method.endsWith("catalog.read") ? catalog : { ...review, expiresAt: Date.now() + 1000 },
  );
  await openReview();
  f.security.appState = "background";
  await act(async () =>
    root.render(
      createElement(SshWorkspace, {
        scope: { machineId: "machine", sessionId: "source" },
        projectId: "project",
        onClose: vi.fn(),
      }),
    ),
  );
  vi.setSystemTime(Date.now() + 2000);
  f.security.appState = "active";
  await act(async () =>
    root.render(
      createElement(SshWorkspace, {
        scope: { machineId: "machine", sessionId: "source" },
        projectId: "project",
        onClose: vi.fn(),
      }),
    ),
  );
  expect(container.textContent).toContain("This SSH review expired.");
  await click("Review again");
  f.onHash = () => vi.setSystemTime(Date.now() + 2000);
  await click("Request computer approval");
  expect(f.data.size).toBe(0);
  expect(f.request.mock.calls.some(([method]) => method.endsWith("approve"))).toBe(false);
});
it("durably claims connect before transport and reopens with requestId-only reconciliation", async () => {
  f.request.mockImplementation(async (method: string) => {
    if (method.endsWith("catalog.read")) return catalog;
    if (method === "ssh.workspace.review") return review;
    if (method.endsWith("approve")) {
      expect([...f.data.keys()].some((key) => key.endsWith(":connect"))).toBe(true);
      throw new Error("Lost response");
    }
    return { state: "opening", workspaceId: "h1." + "w".repeat(83), pendingNativeApproval: true };
  });
  await openReview();
  await click("Request computer approval");
  await act(async () => root.unmount());
  await mount();
  await click("Check status");
  expect(
    f.request.mock.calls.filter(([method]) => method === "ssh.workspace.approve"),
  ).toHaveLength(1);
  expect(f.request).toHaveBeenLastCalledWith(
    "ssh.workspace.status",
    { projectId: "project", sessionId: "source", requestId: "request-1" },
    expect.any(Object),
  );
  expect(container.textContent).toContain("Awaiting approval on the computer");
});
it("requires separate close impact review and persists close attempt before its own approval", async () => {
  f.request.mockImplementation(async (method: string) => {
    if (method.endsWith("catalog.read")) return catalog;
    if (method === "ssh.workspace.review") return review;
    if (method === "ssh.workspace.close.review")
      return { ...review, operation: "close", workspaceId: "h1.workspace", reviewId: "v1.close" };
    if (method === "ssh.workspace.close.approve") {
      expect([...f.data.keys()].some((key) => key.endsWith(":close"))).toBe(true);
      return { state: "closed", workspaceId: "h1.workspace", terminalCount: 0 };
    }
    return { state: "opened-on-computer", workspaceId: "h1.workspace", terminalCount: 1 };
  });
  await openReview();
  await click("Request computer approval");
  await click("Review close impact");
  expect(
    f.request.mock.calls.filter(([method]) => method === "ssh.workspace.close.approve"),
  ).toHaveLength(0);
  await click("Request computer approval");
  expect(f.request).toHaveBeenLastCalledWith(
    "ssh.workspace.close.approve",
    { projectId: "project", sessionId: "source", reviewId: "v1.close", requestId: "request-2" },
    expect.any(Object),
  );
  expect(container.textContent).toContain("Closed");
});
it("storage failure and same-ID endpoint re-pair both refuse a new connect write", async () => {
  f.request.mockImplementation(async (method: string) =>
    method.endsWith("catalog.read") ? catalog : review,
  );
  await openReview();
  f.failSave = true;
  await click("Request computer approval");
  expect(f.request.mock.calls.some(([method]) => method.endsWith("approve"))).toBe(false);
  await act(async () => root.unmount());
  f.failSave = false;
  await openReview();
  f.endpoint = "https://other";
  await click("Request computer approval");
  expect(f.request.mock.calls.some(([method]) => method.endsWith("approve"))).toBe(false);
});
it("corrupt persisted receipt cannot be cleared into an unreviewed new connection", async () => {
  f.data.set('bycoda.ssh-workspace.v1:["machine","env","project","source"]:close', "corrupt");
  await mount();
  await click("Get SSH servers");
  expect(f.request).not.toHaveBeenCalled();
  expect(
    [...container.querySelectorAll("button")].some(
      (button) => button.textContent === "Dismiss error",
    ),
  ).toBe(false);
});
it("restored receipt refuses a replaced endpoint under the same machine/environment and stores no raw target", async () => {
  f.request.mockImplementation(async (method: string) =>
    method.endsWith("catalog.read")
      ? catalog
      : method.endsWith("review")
        ? review
        : { state: "unknown" },
  );
  await openReview();
  await click("Request computer approval");
  const saved = [...f.data.values()].join(" ");
  expect(saved).toContain("targetIdentityDigest");
  expect(saved).not.toContain("https://fixture");
  expect(saved).not.toContain('"fixture"');
  await act(async () => root.unmount());
  f.endpoint = "https://replacement";
  await mount();
  expect(
    [...container.querySelectorAll("button")].some(
      (button) => button.textContent === "Check status",
    ),
  ).toBe(false);
  expect(f.request.mock.calls.filter(([method]) => method === "ssh.workspace.status")).toHaveLength(
    0,
  );
});
it("lock during hashing and background during durable claim prevent an asynchronous approval write", async () => {
  f.request.mockImplementation(async (method: string) =>
    method.endsWith("catalog.read") ? catalog : review,
  );
  await openReview();
  f.onHash = () => {
    f.security.status = "locked";
  };
  await click("Request computer approval");
  expect(f.request.mock.calls.some(([method]) => method.endsWith("approve"))).toBe(false);
  await act(async () => root.unmount());
  f.onHash = undefined;
  f.security.status = "unlocked";
  await openReview();
  f.onSave = () => {
    f.security.appState = "background";
  };
  await click("Request computer approval");
  expect(f.request.mock.calls.some(([method]) => method.endsWith("approve"))).toBe(false);
  expect([...f.data.keys()].some((key) => key.endsWith(":connect"))).toBe(true);
});
