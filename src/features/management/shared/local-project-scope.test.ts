// @vitest-environment happy-dom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

type StoreState = { activeId: string | null; selectedProjectId: string | null; writable: boolean; hydrated: boolean };
const store = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const value: { state: StoreState; listeners: Set<() => void>; set(patch: Partial<StoreState>): void } = {
    state: { activeId: "computer", selectedProjectId: "shared", writable: true, hydrated: true },
    listeners,
    set(patch) {
      value.state = { ...value.state, ...patch };
      for (const listener of listeners) listener();
    },
  };
  return value;
});
vi.mock("@/state/machines", async () => {
  const { useSyncExternalStore } = await import("react");
  const getState = () => ({
    ...store.state,
    selectProject: (id: string | null) => { if (store.state.writable) store.set({ selectedProjectId: id }); },
  });
  const subscribe = (listener: () => void) => { store.listeners.add(listener); return () => { store.listeners.delete(listener); }; };
  const useMachines = Object.assign(
    (select: (state: ReturnType<typeof getState>) => unknown) => useSyncExternalStore(subscribe, () => select(getState())),
    { getState },
  );
  return { useMachines };
});
import { lastSpecificProject, requiredProjectFallback, useAdoptProjectScope, useLocalProjectScope } from "./local-project-scope";

let scope: ReturnType<typeof useLocalProjectScope>;
function Probe({ adopt, machineId, withinAll }: { adopt?: string | null; machineId?: string; withinAll?: boolean }) {
  useAdoptProjectScope(adopt, machineId, { withinAll });
  scope = useLocalProjectScope();
  return h("p", null, scope.projectId ?? "all");
}
const host = document.createElement("div");
const root = createRoot(host);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const render = (props: Parameters<typeof Probe>[0] = {}) => act(() => root.render(h(Probe, props)));
afterEach(() => {
  act(() => root.render(null));
  store.state = { activeId: "computer", selectedProjectId: "shared", writable: true, hydrated: true };
});

it("follows the shared scope live, so every page reads one selection", () => {
  render();
  expect(host.textContent).toBe("shared");
  act(() => store.set({ selectedProjectId: "elsewhere" }));
  expect(host.textContent).toBe("elsewhere");
  act(() => scope.setProjectId(null));
  expect(store.state.selectedProjectId).toBeNull();
  expect(host.textContent).toBe("all");
});

it("adopts a linked project into the shared selection instead of holding a private one", () => {
  render({ adopt: "linked", machineId: "computer" });
  expect(store.state.selectedProjectId).toBe("linked");
  expect(host.textContent).toBe("linked");
  // The pill still changes it afterwards; the link does not re-apply itself.
  act(() => scope.setProjectId("picked"));
  render({ adopt: "linked", machineId: "computer" });
  expect(host.textContent).toBe("picked");
});

it("never applies another computer's project and waits for hydration", () => {
  render({ adopt: "foreign", machineId: "other" });
  expect(store.state.selectedProjectId).toBe("shared");
  act(() => root.render(null));
  store.state.hydrated = false;
  render({ adopt: "early", machineId: "computer" });
  expect(store.state.selectedProjectId).toBe("shared");
  act(() => store.set({ hydrated: true }));
  expect(store.state.selectedProjectId).toBe("early");
});

it("keeps All projects for a page it already contains", () => {
  store.state.selectedProjectId = null;
  render({ adopt: "session-project", machineId: "computer", withinAll: true });
  expect(store.state.selectedProjectId).toBeNull();
  act(() => root.render(null));
  store.state.selectedProjectId = "other";
  render({ adopt: "session-project", machineId: "computer", withinAll: true });
  expect(store.state.selectedProjectId).toBe("session-project");
});

it("leaves the scope unchanged when the shared store refuses the write", () => {
  render();
  store.state.writable = false;
  const before = scope.revision;
  act(() => scope.setProjectId("picked"));
  expect(host.textContent).toBe("shared");
  expect(scope.revision).toBe(before);
});

it("remembers the last specific project per computer for pages that require one", () => {
  render();
  act(() => scope.setProjectId("picked"));
  act(() => scope.setProjectId(null));
  expect(host.textContent).toBe("all");
  expect(lastSpecificProject("computer")).toBe("picked");
  expect(lastSpecificProject("other")).toBeUndefined();
});

it("falls back to the last, then the most recent, then the first project without asking", () => {
  const projects = [{ id: "a" }, { id: "b" }, { id: "c" }];
  expect(requiredProjectFallback({ projects: undefined, last: "b" })).toBeUndefined();
  expect(requiredProjectFallback({ projects: [] })).toBeUndefined();
  expect(requiredProjectFallback({ projects, last: "b", recent: { c: 9 } })).toBe("b");
  // A remembered project that left the directory is never shown.
  expect(requiredProjectFallback({ projects, last: "gone", recent: { c: 9, b: 3, gone: 99 } })).toBe("c");
  expect(requiredProjectFallback({ projects, last: "gone" })).toBe("a");
});
