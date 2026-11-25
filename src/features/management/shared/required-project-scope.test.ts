// @vitest-environment happy-dom
import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

/** A per-computer store like `useMachines`: each computer remembers its own project (null is All). */
const store = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const value = {
    state: { activeId: "a" as string | null, projects: { a: "a-api" } as Record<string, string>, selectedProjectId: "a-api" as string | null },
    directories: { a: ["a-api", "a-web"], b: ["b-app", "b-docs"] } as Record<string, string[]>,
    recent: { b: { "b-docs": 5 } } as Record<string, Record<string, number>>,
    ready: true,
    listeners,
    emit() { for (const listener of listeners) listener(); },
    selectMachine(id: string) { value.state = { ...value.state, activeId: id, selectedProjectId: value.state.projects[id] ?? null }; value.emit(); },
    selectProject(id: string | null) {
      const projects = { ...value.state.projects };
      if (id) projects[value.state.activeId!] = id; else delete projects[value.state.activeId!];
      value.state = { ...value.state, projects, selectedProjectId: id };
      value.emit();
    },
  };
  return value;
});
vi.mock("@/state/machines", async () => {
  const { useSyncExternalStore } = await import("react");
  const getState = () => ({ ...store.state, hydrated: true, selectProject: store.selectProject });
  const subscribe = (listener: () => void) => { store.listeners.add(listener); return () => { store.listeners.delete(listener); }; };
  return { useMachines: Object.assign((select: (state: ReturnType<typeof getState>) => unknown) => useSyncExternalStore(subscribe, () => select(getState())), { getState }) };
});
vi.mock("../../workspace/use-project-directory", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => { store.listeners.add(listener); return () => { store.listeners.delete(listener); }; };
  return { useProjectList: () => {
    // The directory belongs to the active computer, like the real keyed host query.
    const active = useSyncExternalStore(subscribe, () => store.state.activeId);
    return { directoryReady: store.ready, data: store.ready ? (store.directories[active ?? ""] ?? []).map((id) => ({ id })) : undefined };
  } };
});
vi.mock("@/state/project-directory-preferences", () => ({
  useProjectDirectoryPreferences: (machineId?: string) => ({ preferences: { recent: store.recent[machineId ?? ""] ?? {} } }),
}));
import { useRequiredProjectScope } from "./required-project-scope";
import { useLocalProjectScope } from "./local-project-scope";

let required: ReturnType<typeof useRequiredProjectScope>;
let local: ReturnType<typeof useLocalProjectScope>;
function Probe() {
  required = useRequiredProjectScope();
  local = useLocalProjectScope();
  return h("p", null, `${required.projectId ?? "none"}|${local.projectId ?? "all"}`);
}
const host = document.createElement("div");
const root = createRoot(host);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  act(() => root.render(null));
  store.state = { activeId: "a", projects: { a: "a-api" }, selectedProjectId: "a-api" };
  store.ready = true;
});

it("switches to each computer's remembered project and never carries a project across computers", () => {
  act(() => root.render(h(Probe)));
  expect(host.textContent).toBe("a-api|a-api");
  act(() => store.selectMachine("b"));
  // Computer B has no remembered project: All for All-capable pages, B's most recent project for the rest.
  expect(host.textContent).toBe("b-docs|all");
  act(() => required.setProjectId("b-app"));
  expect(host.textContent).toBe("b-app|b-app");
  act(() => store.selectMachine("a"));
  expect(host.textContent).toBe("a-api|a-api");
  act(() => store.selectMachine("b"));
  expect(host.textContent).toBe("b-app|b-app");
});

it("falls back to that computer's last project after All and ignores the other computer's", () => {
  act(() => root.render(h(Probe)));
  act(() => local.setProjectId("a-web"));
  act(() => local.setProjectId(null));
  expect(host.textContent).toBe("a-web|all");
  act(() => store.selectMachine("b"));
  expect(required.projectId).not.toMatch(/^a-/);
  // Required pages never write All: a null choice is ignored.
  act(() => required.setProjectId(null));
  expect(store.state.selectedProjectId).toBeNull();
});

it("treats a remembered project the computer no longer lists as All", () => {
  store.state = { activeId: "b", projects: { b: "b-removed" }, selectedProjectId: "b-removed" };
  act(() => root.render(h(Probe)));
  expect(required.projectId).toBe("b-docs");
  expect(required.fallback).toBe(true);
});

it("waits for the computer's directory instead of guessing a project", () => {
  store.state = { activeId: "b", projects: {}, selectedProjectId: null };
  store.ready = false;
  act(() => root.render(h(Probe)));
  expect(required.projectId).toBeNull();
});

it("retires captured scope when the computer changes", () => {
  act(() => root.render(h(Probe)));
  const before = { ...required.current.current };
  act(() => store.selectMachine("b"));
  expect(required.current.current.machineId).toBe("b");
  expect(required.current.current.revision).toBeGreaterThan(before.revision);
});
