// @vitest-environment happy-dom
import { act, Children, createElement, isValidElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Scope } from "./scope";

const fixture = vi.hoisted(() => ({
  projects: {
    data: [{ id: "private", name: "Private project", cwd: "/private" }],
    directoryReady: false,
    privacyUnavailable: false,
    readiness: "loading",
    isFetching: false,
    isLoading: true,
    error: null as Error | null,
    isProjectVisible: vi.fn(),
  },
  linkDown: false,
  selectProject: vi.fn(),
}));

vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/state/machines", () => ({
  useMachines: (select: (state: { selectedProjectId: null; selectProject: typeof fixture.selectProject }) => unknown) =>
    select({ selectedProjectId: null, selectProject: fixture.selectProject }),
}));
vi.mock("@/ui/primitives", () => ({
  SelectField: ({ onChange, placeholder }: { onChange: (value: string) => void; placeholder: string }) =>
    createElement("button", { onClick: () => onChange("private"), "data-placeholder": placeholder }, "select"),
  ErrorNotice: ({ error }: { error: Error }) => createElement("p", { "data-notice": true }, error.message),
  StateView: () => createElement("section", { "data-state-view": true }),
}));
vi.mock("@/ui/error-message", () => ({ isConnectionLevelError: () => false }));
vi.mock("@/state/query-retry", () => ({ isTransientConnectionError: () => false }));
vi.mock("@/state/host-runtime-state", () => ({ useActiveHostLinkDown: () => fixture.linkDown }));
vi.mock("../../workspace/use-project-directory", () => ({ useProjectList: () => fixture.projects }));
vi.mock("../../workspace/project-directory-feedback", () => ({ ProjectDirectoryFeedback: "ProjectDirectoryFeedback" }));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.assign(fixture.projects, {
    directoryReady: false, privacyUnavailable: false, readiness: "loading",
    isFetching: false, isLoading: true, error: null,
  });
  fixture.projects.isProjectVisible.mockReset();
  fixture.linkDown = false;
  fixture.selectProject.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

it("keeps a failed project directory to one compact notice", () => {
  Object.assign(fixture.projects, { error: new Error("Can't reach"), readiness: "error", isLoading: false });
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    act(() => root.render(createElement(Scope, { allowAll: true, projectId: null, onChange: vi.fn() })));
    expect(host.querySelector("[data-state-view]")).toBeNull();
    expect(host.querySelectorAll("[data-notice]")).toHaveLength(1);
    expect(host.querySelector("button")?.getAttribute("data-placeholder")).toBe("Unavailable");
  } finally {
    act(() => root.unmount());
  }
});

it("keeps filter changes local to its owner", () => {
  Object.assign(fixture.projects, { directoryReady: true, readiness: "ready" });
  fixture.projects.isProjectVisible.mockReturnValue(true);
  const onChange = vi.fn();
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    act(() => root.render(createElement(Scope, { allowAll: true, projectId: null, onChange })));
    act(() => host.querySelector("button")!.click());
    expect(onChange).toHaveBeenCalledWith("private");
    expect(fixture.selectProject).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
  }
});

function field(allowAll = true, projectId: string | null = null, onChange = vi.fn()) {
  const element = Children.toArray(Scope({ allowAll, projectId, onChange }).props.children)[0];
  if (!isValidElement<Record<string, unknown>>(element)) throw new Error("Missing project filter");
  return element.props;
}

it("replaces a blocked project filter with directory sync recovery", () => {
  Object.assign(fixture.projects, { privacyUnavailable: true, readiness: "sync-required", isLoading: false });
  const output = Scope({ projectId: "private", allowAll: true, onChange: vi.fn() });
  expect(output.type).toBe("ProjectDirectoryFeedback");
  expect(output.props).toMatchObject({ compact: true, privacyUnavailable: true, query: fixture.projects });
});

it("keeps unresolved options hidden and announces the actual state", () => {
  const onChange = vi.fn();
  const loading = field(true, null, onChange);
  expect(loading).toMatchObject({ disabled: true, value: undefined, options: [], placeholder: "Loading projects…" });
  (loading.onChange as (id: string) => void)("");
  expect(onChange).not.toHaveBeenCalled();
  fixture.linkDown = true;
  fixture.projects.readiness = "waiting";
  expect(field().placeholder).toBe("Waiting for a connection");
});

it("retains explicit All and checks selected projects against current visibility", () => {
  Object.assign(fixture.projects, { directoryReady: true, readiness: "ready" });
  const onChange = vi.fn();
  const ready = field(true, null, onChange);
  expect(ready).toMatchObject({ disabled: false, value: "" });
  const change = ready.onChange as (id: string) => void;
  change("private");
  expect(onChange).not.toHaveBeenCalled();
  fixture.projects.isProjectVisible.mockReturnValue(true);
  change("private");
  change("");
  expect(onChange.mock.calls).toEqual([["private"], [null]]);
});
