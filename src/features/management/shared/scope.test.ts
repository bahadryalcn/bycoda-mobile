// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Scope } from "./scope";

const state = vi.hoisted(() => ({ error: new Error("Can't reach") as Error | null }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/machines", () => ({ useMachines: (select: any) => select({ selectedProjectId: null, selectProject: vi.fn() }) }));
vi.mock("../../workspace/use-project-directory", () => ({
  useProjectList: () => ({ data: undefined, error: state.error, isFetching: false, isLoading: false, refetch: vi.fn(), directoryReady: false, isProjectVisible: () => true }),
}));
vi.mock("../../workspace/activity-model", () => ({ deduplicateProjects: () => [] }));
vi.mock("@/ui/primitives", () => ({
  SelectField: () => createElement("select"),
  ErrorNotice: ({ error }: { error: Error }) => createElement("p", { "data-notice": true }, error.message),
  Loading: () => createElement("i"),
  StateView: () => createElement("section", { "data-state-view": true }),
}));

it("keeps a failed project directory to one compact notice, never a full state view in the field", () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(createElement(Scope, { allowAll: true })));
  expect(host.querySelector("[data-state-view]")).toBeNull();
  expect(host.querySelectorAll("[data-notice]")).toHaveLength(1);
  act(() => root.unmount());
});
