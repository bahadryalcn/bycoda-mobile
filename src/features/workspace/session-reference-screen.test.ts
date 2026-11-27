// @vitest-environment happy-dom
import { act, createElement, useEffect, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { onlineManager } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { SessionReferenceScreen } from "./session-reference-screen";
import { RemoteHostError } from "../../remote/host-error";
import { recordHostRuntimeStartupFailed } from "../../state/host-runtime-state";

const fixture = vi.hoisted(() => ({
  navigate: vi.fn(),
  replace: vi.fn(),
  request: vi.fn(),
  switchTo: vi.fn(),
  switchError: null as Error | null,
  readable: true,
  available: false,
  focused: true,
  state: {
    machines: [{ id: "paired", environmentId: "host", name: "Test computer", capabilities: ["sessions.references.v1", "transport.ws.v2"] }],
    activeId: "paired",
    hydrated: true,
    storageError: null as string | null,
    connectionPending: false,
    selectMachine: vi.fn(),
  },
}));
vi.mock("expo-router", () => ({
  router: { navigate: fixture.navigate, push: fixture.navigate, replace: fixture.replace },
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { focused } = fixture;
    useEffect(() => (focused ? effect() : undefined), [effect, focused]);
  },
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
vi.mock("@/state/machines", () => ({
  useMachines: Object.assign((select: (state: typeof fixture.state) => unknown) => select(fixture.state), {
    getState: () => fixture.state,
  }),
}));
vi.mock("@/state/queries", () => {
  const client = { request: fixture.request };
  return { useHostClient: () => fixture.available ? client : null, useHostReadActive: () => fixture.readable, useConsentPending: () => false };
});
vi.mock("@/state/security", () => ({ assertAppAccess: () => {} }));
vi.mock("../connections/use-switch-computer", () => ({
  useSwitchComputer: () => ({ busy: false, operation: { error: fixture.switchError, reset: vi.fn() }, switchTo: fixture.switchTo }),
}));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/tokens", () => ({ space: { md: 12 } }));
vi.mock("lucide-react-native/icons/laptop", () => ({ default: () => null }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label);
  const StateView = ({ title, description, action }: { title: string; description?: string; action?: { label: string; onPress: () => void } }) =>
    createElement("div", null, title, description, action ? createElement(Button, action) : null);
  return {
    Body: Group, Button, Empty: StateView, StateView, NavigationGroup: Group, RowIcon: () => null,
    NavigationRow: ({ label, onPress }: { label: string; onPress: () => void }) => createElement(Button, { label, onPress }),
    ErrorNotice: ({ error, onRetry, action, children }: PropsWithChildren<{ error: Error; onRetry?: () => void; action?: { label: string; onPress: () => void } }>) =>
      createElement("div", null, error.message, onRetry ? createElement(Button, { label: "Retry", onPress: onRetry }) : null,
        action ? createElement(Button, action) : null, children),
    QueryState: ({ query }: { query: { fetchStatus?: string } }) =>
      query.fetchStatus === "paused" ? createElement("div", null, "You're offline") : null,
    Loading: ({ label }: { label: string }) => createElement("div", { role: "status" }, label),
    Screen: ({ children, footer, scroll = true }: PropsWithChildren<{ footer?: React.ReactNode; scroll?: boolean }>) =>
      createElement("main", { "data-scroll": scroll }, children, createElement("footer", null, footer)),
  };
});

it("waits offline, discards an interrupted lookup and resumes the exact link", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.available = true;
  fixture.request.mockReset();
  fixture.replace.mockClear();
  onlineManager.setOnline(false);
  const route = { projectId: "project", session: { id: "session" } };
  let release!: (result: typeof route) => void;
  fixture.request.mockReturnValueOnce(new Promise<typeof route>((resolve) => { release = resolve; }));
  fixture.request.mockResolvedValueOnce(route);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(SessionReferenceScreen, {
      link: "bycoda://session/v1/host/host/session?turn=exact-turn",
    })));
    expect(container.textContent).toContain("You're offline");
    expect(fixture.request).not.toHaveBeenCalled();
    await act(async () => onlineManager.setOnline(true));
    expect([...container.querySelectorAll('[role="status"]')].map((status) => status.textContent))
      .toEqual(["Opening session…"]);
    expect(container.textContent).toContain("Test computer");
    const openingActions = [...container.querySelectorAll("button")].map((button) => button.textContent);
    expect(openingActions).toEqual(["Manage connections", "Back to projects"]);
    const signal = fixture.request.mock.calls[0][2].signal as AbortSignal;
    await act(async () => onlineManager.setOnline(false));
    expect(signal.aborted).toBe(true);
    await act(async () => release(route));
    expect(fixture.replace).not.toHaveBeenCalled();
    await act(async () => onlineManager.setOnline(true));
    expect(fixture.request).toHaveBeenCalledTimes(2);
    expect(fixture.replace).toHaveBeenCalledExactlyOnceWith({
      pathname: "/session/[id]",
      params: { id: "session", projectId: "project", machineId: "paired", targetTurnId: "exact-turn" },
    });
  } finally {
    await act(async () => root.unmount());
    fixture.available = false;
    fixture.request.mockReset();
    fixture.replace.mockClear();
    onlineManager.setOnline(true);
    vi.unstubAllGlobals();
  }
});

it("replaces a resolved link once when the computer descriptor refreshes during navigation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const machines = fixture.state.machines;
  fixture.replace.mockClear();
  fixture.request.mockReset().mockResolvedValue({ projectId: "project", session: { id: "session" } });
  fixture.available = true;
  const root = createRoot(document.createElement("div"));
  const render = (turn: string) => act(async () => root.render(createElement(SessionReferenceScreen, {
    link: `bycoda://session/v1/host/host/session?turn=${turn}`,
  })));
  try {
    await render("first-turn");
    expect(fixture.replace).toHaveBeenCalledOnce();
    fixture.state.machines = machines.map(machine => ({ ...machine, name: "Updated computer" }));
    await render("first-turn");
    expect(fixture.request).toHaveBeenCalledOnce();
    expect(fixture.replace).toHaveBeenCalledOnce();

    await render("second-turn");
    expect(fixture.replace).toHaveBeenCalledTimes(2);
    expect(fixture.replace.mock.lastCall?.[0].params.targetTurnId).toBe("second-turn");
  } finally {
    await act(async () => root.unmount());
    fixture.state.machines = machines;
    fixture.available = false;
    fixture.request.mockReset();
    fixture.replace.mockClear();
    vi.unstubAllGlobals();
  }
});

it("preserves the current computer when the workspace draft blocks an automatic switch", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.state.activeId = "other";
  fixture.available = false;
  fixture.state.selectMachine.mockClear();
  fixture.switchTo.mockImplementationOnce(async () => {
    fixture.switchError = new Error("Save the workspace draft before switching.");
  });
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = () => act(async () => root.render(createElement(SessionReferenceScreen, {
    link: "bycoda://session/v1/host/host/session",
  })));
  try {
    await render();
    await render();
    expect(fixture.switchTo).toHaveBeenCalledTimes(1);
    expect(fixture.state.selectMachine).not.toHaveBeenCalled();
    expect(fixture.state.activeId).toBe("other");
    expect(container.textContent).toContain("Save the workspace draft before switching.");
    const stillCurrent = fixture.switchTo.mock.calls[0][2] as () => boolean;
    expect(stillCurrent()).toBe(true);
    fixture.readable = false;
    await render();
    expect(stillCurrent()).toBe(false);
    fixture.readable = true;
    await render();
    expect(stillCurrent()).toBe(false);

    fixture.switchTo.mockImplementationOnce(async (_id, onDone: () => void) => {
      fixture.switchError = null;
      fixture.state.activeId = "paired";
      onDone();
    });
    const candidate = [...container.querySelectorAll("button")].find((button) => button.textContent === "Test computer");
    await act(() => candidate!.click());
    expect(fixture.switchTo).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Waiting for a connection");
  } finally {
    await act(async () => root.unmount());
    fixture.state.activeId = "paired";
    fixture.switchError = null;
    fixture.readable = true;
    fixture.switchTo.mockReset();
    vi.unstubAllGlobals();
  }
});

it("opens the pairing choices directly when the conversation's computer is unpaired", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  fixture.navigate.mockClear();
  try {
    await act(() => root.render(createElement(SessionReferenceScreen, {
      link: "bycoda://session/v1/host/unpaired/session",
    })));
    const connect = [...container.querySelectorAll("button")].find((button) =>
      button.textContent === "Connect a computer");
    expect(connect).toBeDefined();
    await act(() => connect!.click());
    expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith({
      pathname: "/machines", params: { start: "choices" },
    });
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("offers connection recovery when the paired computer cannot provide a client", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = () => act(async () => root.render(createElement(SessionReferenceScreen, { link: "bycoda://session/v1/host/host/session" })));
  try {
    await render();
    expect(container.textContent).not.toContain("Opening session…");
    expect(container.textContent).toContain("Waiting for a connection");
    expect(container.querySelector("main")?.dataset.scroll).toBe("true");
    const buttons = [...container.querySelectorAll("button")];
    expect(container.textContent).toContain("Test computer");
    expect(buttons.some((button) => button.textContent === "Test computer")).toBe(false);
    const manage = buttons.find((button) => button.textContent === "Manage connections");
    await act(() => {
      manage!.click();
      manage!.click();
    });
    expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith({
      pathname: "/machines", params: { returnToPrevious: "1" },
    });
    fixture.focused = false;
    await render();
    fixture.focused = true;
    await render();
    await act(() => manage!.click());
    expect(fixture.navigate).toHaveBeenCalledTimes(2);
    expect(fixture.navigate).toHaveBeenLastCalledWith({
      pathname: "/machines", params: { returnToPrevious: "1" },
    });
    expect(fixture.replace).not.toHaveBeenCalled();
    expect(fixture.request).not.toHaveBeenCalled();

    await act(() => recordHostRuntimeStartupFailed(true));
    expect(container.textContent).toContain("Connection couldn’t start");
    expect(container.textContent).toContain("Close and reopen bycoda, then open this link again.");
    expect(container.textContent).not.toContain("Waiting for a connection");
    expect(fixture.request).not.toHaveBeenCalled();

    await act(() => recordHostRuntimeStartupFailed(false));
    fixture.available = true;
    fixture.request.mockResolvedValueOnce({ projectId: "project", session: { id: "session" } });
    await render();
    expect(fixture.request).toHaveBeenCalledExactlyOnceWith("sessions.get",
      expect.objectContaining({ reference: { kind: "host", environmentId: "host", sessionId: "session" } }),
      expect.objectContaining({ retry: false }));
    expect(fixture.replace).toHaveBeenCalledExactlyOnceWith({
      pathname: "/session/[id]", params: { id: "session", projectId: "project", machineId: "paired" },
    });
  } finally {
    await act(async () => root.unmount());
    recordHostRuntimeStartupFailed(false);
    fixture.focused = true;
    fixture.available = false;
    fixture.request.mockReset();
    fixture.replace.mockClear();
    vi.unstubAllGlobals();
  }
});

it("resolves the exact link after its computer is removed and paired again", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const [original] = fixture.state.machines;
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = () => act(async () => root.render(createElement(SessionReferenceScreen, {
    link: "bycoda://session/v1/host/host/session?turn=exact-turn",
  })));

  try {
    await render();
    expect(container.textContent).toContain("Waiting for a connection");

    fixture.readable = false;
    fixture.state.machines = [{ ...original, id: "paired-again" }];
    fixture.state.activeId = "paired-again";
    fixture.available = true;
    fixture.request.mockResolvedValueOnce({ projectId: "project", session: { id: "session" } });
    await render();
    expect(fixture.request).not.toHaveBeenCalled();

    fixture.readable = true;
    await render();
    expect(fixture.replace).toHaveBeenCalledExactlyOnceWith({
      pathname: "/session/[id]",
      params: { id: "session", projectId: "project", machineId: "paired-again", targetTurnId: "exact-turn" },
    });
  } finally {
    await act(async () => root.unmount());
    fixture.state.machines = [original];
    fixture.state.activeId = original.id;
    fixture.readable = true;
    fixture.available = false;
    fixture.request.mockReset();
    fixture.replace.mockClear();
    vi.unstubAllGlobals();
  }
});

it.each([
  { kind: "network", expected: ["Retry", "Manage connections", "Back to projects"] },
  { kind: "unsupported", expected: ["Manage connections", "Back to projects"] },
] as const)("keeps distinct recovery controls after a $kind error", async ({ kind, expected }) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.available = true;
  fixture.request.mockReset().mockRejectedValueOnce(new RemoteHostError("paired", kind, "Reference could not open"));
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(SessionReferenceScreen, {
      link: "bycoda://session/v1/host/host/session?turn=exact-turn",
    })));
    expect([...container.querySelectorAll("button")].map((button) => button.textContent)).toEqual(expected);
    expect(container.textContent).toContain("Test computer");
    expect(fixture.request).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    fixture.available = false;
    fixture.request.mockReset();
    vi.unstubAllGlobals();
  }
});

it("offers one retry after a timeout and opens the exact referenced turn", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.available = true;
  fixture.request.mockReset()
    .mockRejectedValueOnce(new RemoteHostError("paired", "timeout", "Refresh to check the result."))
    .mockResolvedValueOnce({ projectId: "project", session: { id: "session" } });
  fixture.replace.mockClear();
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(SessionReferenceScreen, {
      link: "bycoda://session/v1/host/host/session?turn=exact-turn",
    })));
    const actions = [...container.querySelectorAll("button")];
    expect(actions.map((button) => button.textContent)).toEqual(["Retry", "Manage connections", "Back to projects"]);
    expect(container.textContent).toContain("The computer took too long to respond");
    expect(container.textContent).toContain("Test computer");
    expect(container.textContent).not.toContain("Refresh to check the result");
    expect(fixture.request).toHaveBeenCalledOnce();
    await act(async () => actions[0].click());
    expect(fixture.request).toHaveBeenCalledTimes(2);
    expect(fixture.request.mock.calls[1].slice(0, 2)).toEqual(fixture.request.mock.calls[0].slice(0, 2));
    expect(fixture.replace).toHaveBeenCalledExactlyOnceWith({
      pathname: "/session/[id]",
      params: { id: "session", projectId: "project", machineId: "paired", targetTurnId: "exact-turn" },
    });
  } finally {
    await act(async () => root.unmount());
    fixture.available = false;
    fixture.request.mockReset();
    fixture.replace.mockClear();
    vi.unstubAllGlobals();
  }
});

it.each(["auth", "identity"] as const)("offers connection repair after %s denial without repeating the blocked read", async (kind) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.available = true;
  fixture.navigate.mockClear();
  fixture.replace.mockClear();
  fixture.request.mockRejectedValueOnce(new RemoteHostError("paired", kind, "Connection must be repaired"));
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(SessionReferenceScreen, {
      link: "bycoda://session/v1/host/host/session?turn=exact-turn",
    })));
    const actions = [...container.querySelectorAll("button")];
    expect(actions.map((button) => button.textContent)).toEqual(["Manage connections", "Back to projects"]);
    await act(async () => { actions[0].click(); actions[0].click(); });
    expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith({
      pathname: "/machines", params: { returnToPrevious: "1" },
    });
    expect(fixture.request).toHaveBeenCalledOnce();
    expect(fixture.replace).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    fixture.available = false;
    fixture.request.mockReset();
    fixture.navigate.mockClear();
    vi.unstubAllGlobals();
  }
});
