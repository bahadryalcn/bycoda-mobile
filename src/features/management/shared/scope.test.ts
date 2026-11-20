// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Scope } from "./scope";

const state = vi.hoisted(() => ({ select: vi.fn(), error: new Error("Can't reach") as Error | null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/machines", () => ({ useMachines: (select: any) => select({ selectedProjectId: null, selectProject: state.select }) }));
vi.mock("../../workspace/use-project-directory", () => ({
  useProjectList: () => ({ data: undefined, error: state.error, isFetching: false, isLoading: false, refetch: vi.fn(), directoryReady: !state.error, isProjectVisible: () => true }),
}));
vi.mock("../../workspace/activity-model", () => ({ deduplicateProjects: () => [] }));
vi.mock("@/ui/primitives", () => ({
  SelectField: ({ onChange, placeholder }: { onChange: (value: string) => void; placeholder: string }) => createElement("button", { onClick: () => onChange("p"), "data-placeholder": placeholder }, "select"),
  ErrorNotice: ({ error }: { error: Error }) => createElement("p", { "data-notice": true }, error.message),
  Loading: () => createElement("i"),
  StateView: () => createElement("section", { "data-state-view": true }),
}));

it("keeps a failed project directory to one compact notice, never a full state view in the field", () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(createElement(Scope, { allowAll: true, projectId: null, onChange: vi.fn() })));
  expect(host.querySelector("[data-state-view]")).toBeNull();
  expect(host.querySelectorAll("[data-notice]")).toHaveLength(1);
  // A disabled field while the directory is not ready never asks the owner to choose.
  expect(host.querySelector("button")!.getAttribute("data-placeholder")).toBe("Loading projects…");
  act(() => root.unmount());
});

it("keeps filter changes local to its owner", () => {
  state.error = null;
  const onChange = vi.fn();
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(createElement(Scope, { allowAll: true, projectId: null, onChange })));
  act(() => host.querySelector("button")!.click());
  expect(onChange).toHaveBeenCalledWith("p");
  expect(state.select).not.toHaveBeenCalled();
  act(() => root.unmount());
});
