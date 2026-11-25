// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { WorkspaceRouteScope } from "./route-scope";

const fixture = vi.hoisted(() => ({
  activeId: "a",
  machines: [{ id: "a", name: "Computer A" }, { id: "b", name: "Computer B" }],
}));
vi.mock("@/state/machines", () => ({ useMachines: (select: (state: typeof fixture) => unknown) => select(fixture) }));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null }, router: {} }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/no-computer", () => ({ NO_COMPUTER_TITLE: ["", "Connect a computer first"], NO_COMPUTER_ACTION: ["", "Connect a computer"] }));
vi.mock("@/ui/primitives", () => {
  const Group = ({ children }: PropsWithChildren) => createElement("div", null, children);
  const State = ({ title, description }: { title: string; description?: string }) =>
    createElement("div", null, title, description);
  return { Screen: Group, Body: Group, Button: () => null, Empty: State, StateView: State };
});

it.each([undefined, "a"])("holds the original route on a computer switch and accepts a new explicit destination (%s)", async (initial) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fixture.activeId = "a";
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = (machineId?: string) => act(async () => root.render(
    createElement(WorkspaceRouteScope, { machineId }, "Workspace content"),
  ));
  try {
    await render(initial);
    expect(container.textContent).toContain("Workspace content");
    fixture.activeId = "b";
    await render(initial);
    expect(container.textContent).not.toContain("Workspace content");
    expect(container.textContent).toContain("another computer");

    await render("b");
    expect(container.textContent).toContain("Workspace content");
    expect(container.textContent).not.toContain("another computer");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
