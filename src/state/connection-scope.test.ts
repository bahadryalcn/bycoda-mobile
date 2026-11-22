// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { useMachines } from "./machines";
import { useConnectionScope, type ConnectionScope } from "./connection-scope";

const fixture = vi.hoisted(() => ({ token: 0 }));
vi.mock("expo-crypto", () => ({ randomUUID: () => String(++fixture.token) }));
vi.mock("@/state/machines", async () => {
  const { create } = await import("zustand");
  return { useMachines: create(() => ({
    activeId: "same-row",
    machines: [{ id: "same-row", endpoint: "https://computer.invalid", environmentId: "env", lanKey: "pin" }],
    accountPending: false,
    pendingMachineIds: [] as string[],
    credentialRevisions: new Map<string, number>(),
  })) };
});

it("retires authority during and after a credential replacement with unchanged connection metadata", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(document.createElement("div"));
  let scope!: ConnectionScope;
  let renderedAuthority = false;
  function CaptureScope() {
    scope = useConnectionScope();
    renderedAuthority = scope.isCurrent();
    return null;
  }
  try {
    await act(async () => root.render(createElement(CaptureScope)));
    const original = scope;
    expect(original.isCurrent()).toBe(true);
    await act(async () => {
      useMachines.setState({ pendingMachineIds: ["other-row"] });
    });
    expect(scope).toBe(original);

    await act(async () => useMachines.setState({ pendingMachineIds: ["same-row"] }));
    expect(scope).toBe(original);
    expect(renderedAuthority).toBe(false);
    await act(async () => useMachines.setState({ pendingMachineIds: [] }));
    expect(scope).toBe(original);
    expect(renderedAuthority).toBe(true);
    expect(original.isCurrent()).toBe(true);

    await act(async () => {
      useMachines.setState({ pendingMachineIds: ["same-row"] });
      expect(original.isCurrent()).toBe(false);
      useMachines.setState({ credentialRevisions: new Map([["same-row", 1]]) });
      useMachines.setState({ pendingMachineIds: [] });
      expect(original.isCurrent()).toBe(false);
    });
    expect(scope.token).not.toBe(original.token);
    expect(scope.review).toEqual(original.review);
    expect(scope.isCurrent()).toBe(true);

    await act(async () => useMachines.setState({ pendingMachineIds: ["same-row"] }));
    expect(scope.isCurrent()).toBe(false);
  } finally {
    await act(async () => root.unmount());
    useMachines.setState({ pendingMachineIds: [], credentialRevisions: new Map() });
    vi.unstubAllGlobals();
  }
});
