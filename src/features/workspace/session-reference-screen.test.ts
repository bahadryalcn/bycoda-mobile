// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SessionReferenceScreen } from "./session-reference-screen";

const fixture = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  request: vi.fn(),
  available: false,
  state: {
    machines: [{ id: "paired", environmentId: "host", name: "Test computer", capabilities: ["sessions.references.v1"] }],
    activeId: "paired",
    hydrated: true,
    storageError: null as string | null,
    connectionPending: false,
    selectMachine: vi.fn(),
  },
}));
vi.mock("expo-router", () => ({ router: { push: fixture.push, replace: fixture.replace } }));
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
  return { useHostClient: () => fixture.available ? client : null, useHostReadActive: () => true, useConsentPending: () => false };
});
vi.mock("@/state/security", () => ({ assertAppAccess: () => {} }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/tokens", () => ({ space: { md: 12 } }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const Button = ({ label, onPress }: { label: string; onPress: () => void }) => createElement("button", { onClick: onPress }, label);
  const StateView = ({ title, action }: { title: string; action?: { label: string; onPress: () => void } }) =>
    createElement("div", null, title, action ? createElement(Button, action) : null);
  return {
    Body: Group, Button, Empty: StateView, StateView, ErrorNotice: Group, QueryState: Group,
    Loading: ({ label }: { label: string }) => createElement("div", { role: "status" }, label),
    Screen: ({ children, footer, scroll = true }: PropsWithChildren<{ footer?: React.ReactNode; scroll?: boolean }>) =>
      createElement("main", { "data-scroll": scroll }, children, createElement("footer", null, footer)),
  };
});

it("offers connection recovery when the paired computer cannot provide a client", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = () => act(async () => root.render(createElement(SessionReferenceScreen, { link: "bycoda://session/v1/host/host/session" })));
  try {
    await render();
    expect(container.textContent).not.toContain("Opening conversation…");
    expect(container.textContent).toContain("Waiting for a connection");
    expect(container.querySelector("main")?.dataset.scroll).toBe("true");
    const buttons = [...container.querySelectorAll("button")];
    const manage = buttons.find((button) => button.textContent === "Manage connections");
    await act(() => manage!.click());
    expect(fixture.push).toHaveBeenCalledExactlyOnceWith("/machines");
    expect(fixture.replace).not.toHaveBeenCalled();
    expect(fixture.request).not.toHaveBeenCalled();

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
    vi.unstubAllGlobals();
  }
});
