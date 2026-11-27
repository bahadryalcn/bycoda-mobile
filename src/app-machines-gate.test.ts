// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ uiStyles: {} }) }));
vi.mock("./ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("./ui/primitives", () => ({ Loading: ({ label }: { label: string }) => createElement("p", null, label) }));
vi.mock("./state/machines", async () => {
  const { create } = await import("zustand");
  return { useMachines: create(() => ({ hydrated: false })) };
});
import { useMachines } from "./state/machines";
import { MachinesReadyGate } from "./app-machines-gate";

const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

it("keeps the protected workspace unmounted until the saved computers are hydrated", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(MachinesReadyGate, null, createElement("main", null, "workspace"))));
    expect(container.textContent).toBe("Loading…");
    await act(async () => useMachines.setState({ hydrated: true } as never));
    expect(container.textContent).toBe("workspace");
    // A hydration retry hides the workspace again instead of exposing stale machine state.
    await act(async () => useMachines.setState({ hydrated: false } as never));
    expect(container.textContent).toBe("Loading…");
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("starts hydration, the app lock and the account load together instead of nesting their loaders", () => {
  const providers = source("./app-providers.tsx");
  const order = ["<AccountProvider>", "<SecurityGate>", "<MachinesReadyGate>", "<AccountGate>"].map((tag) => providers.indexOf(tag));
  // Account above the lock (Clerk loads while the user authenticates); machines and account
  // loading gates stay inside the lock so no protected content mounts before unlock.
  expect(order.every((index) => index >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  // AppLifecycle only starts hydration; it must not replace the tree with a loader.
  const lifecycle = source("./app-lifecycle.tsx");
  expect(lifecycle).toContain("void hydrate()");
  expect(lifecycle).not.toMatch(/if \(!hydrated\)\s*return/);
});
