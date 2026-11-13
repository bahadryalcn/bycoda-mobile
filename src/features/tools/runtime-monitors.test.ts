// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { RuntimeMonitors } from "./runtime-monitors";
const state = vi.hoisted(() => ({
  machineId: "machine-a",
  endpoint: "https://synthetic.invalid",
  active: true,
  data: [
    { id: "monitor", projectId: "project", url: "http://localhost:3000/", sourceId: "source" },
  ],
  error: null as unknown,
  pending: false,
  methods: [] as string[],
  requests: [] as unknown[],
  refetch: vi.fn(async () => ({ isError: false })),
}));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("@/ui/theme", () => ({
  useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }),
}));
vi.mock("@/state/machines", () => {
  const machine = () => ({ id: state.machineId, name: "Computer", endpoint: state.endpoint });
  return {
    useActiveMachine: machine,
    useMachines: { getState: () => ({ activeId: state.machineId, machines: [machine()] }) },
  };
});
vi.mock("@/state/queries", () => ({
  useHostReadActive: () => state.active,
  useHostQuery: (_key: unknown, method: string) => {
    state.methods.push(method);
    return { data: state.data, refetch: state.refetch };
  },
  useHostMutation: (method: string) => ({
    isPending: state.pending,
    error: state.error,
    reset: () => {
      state.error = null;
    },
    mutateAsync: async (params: unknown) => {
      state.requests.push({ method, params });
    },
  }),
}));
vi.mock("@/ui/copy", () => ({
  useCopy: () => (_tr: string, en: string, values?: Record<string, unknown>) =>
    en.replace(/\{(p\d+)\}/g, (token, key: string) => String(values?.[key] ?? token)),
}));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Badge: Wrapper,
    Row: Wrapper,
    IconButton: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      disabled?: boolean;
    }) => createElement("button", { onClick: onPress, disabled }, label),
    FormActions: ({
      submitLabel,
      onSubmit,
      disabled,
      busy,
      feedback,
    }: {
      submitLabel: string;
      onSubmit: () => void;
      disabled?: boolean;
      busy?: boolean;
      feedback?: import("react").ReactNode;
    }) =>
      createElement(
        "div",
        null,
        feedback,
        createElement("button", { disabled: disabled || busy, onClick: onSubmit }, submitLabel),
      ),
    Body: Wrapper,
    Disclosure: Wrapper,
    NavigationGroup: Wrapper,
    Sheet: Wrapper,
    QueryState: () => null,
    MutationState: () => null,
    ErrorText: () => null,
    StateView: ({ title, description }: any) => createElement("p", null, title, description),
    Notice: ({ message }: { message: string }) => createElement("p", null, message),
    Button: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      disabled?: boolean;
    }) => createElement("button", { onClick: onPress, disabled }, label),
    NavigationRow: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      disabled?: boolean;
    }) => createElement("button", { onClick: onPress, disabled }, label),
    Field: ({ value, onChangeText, error, editable }: any) =>
      createElement(
        "label",
        null,
        error,
        createElement("input", {
          value,
          disabled: !editable,
          onChange: (event: import("react").ChangeEvent<HTMLInputElement>) =>
            onChangeText(event.target.value),
        }),
      ),
    ConfirmationCard: ({
      confirmLabel,
      onConfirm,
      disabled,
    }: {
      confirmLabel: string;
      onConfirm: () => void;
      disabled?: boolean;
    }) => createElement("button", { onClick: onConfirm, disabled }, confirmLabel),
  };
});
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
async function render(projectId = "project") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!root) {
    container = document.createElement("div");
    root = createRoot(container);
  }
  await act(async () =>
    root!.render(createElement(RuntimeMonitors, { projectId, onClose: vi.fn() })),
  );
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === label,
  )!;
  await act(async () => button.click());
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  state.error = null;
  state.active = true;
  state.machineId = "machine-a";
  state.requests = [];
  state.methods = [];
  state.endpoint = "https://synthetic.invalid";
  state.refetch.mockReset().mockResolvedValue({ isError: false });
  vi.unstubAllGlobals();
});
it("lists without starting capture; stop requires explicit confirmation and exact project/id", async () => {
  await render();
  expect(state.requests).toEqual([]);
  expect(state.methods).toEqual(["runtimeLogs.monitors.list"]);
  await click("http://localhost:3000/");
  expect(state.requests).toEqual([]);
  await click("Stop");
  expect(state.requests).toEqual([
    { method: "runtimeLogs.monitors.stop", params: { projectId: "project", id: "monitor" } },
  ]);
});

it("explains the eight-monitor capacity using the actual list without starting another monitor", async () => {
  const previous = state.data;
  state.data = Array.from({ length: 8 }, (_, index) => ({
    ...previous[0]!,
    id: `monitor-${index}`,
    url: `http://localhost:${3000 + index}/`,
  }));
  try {
    await render();
    expect(container.textContent).toContain("Active monitors: 8 / 8");
    expect(container.textContent).toContain("Stop one from the list to start another.");
    expect(state.requests).toEqual([]);
  } finally {
    state.data = previous;
  }
});
it("blocks writes after uncertain delivery until an explicit successful refresh", async () => {
  state.error = { uncertain: true };
  await render();
  expect(container.textContent).toContain("outcome is unknown");
  await click("http://localhost:3000/");
  expect(state.requests).toEqual([]);
  await click("Refresh");
  await click("http://localhost:3000/");
  await click("Stop");
  expect(state.requests).toHaveLength(1);
});
it("does not retarget a confirmation after the active machine changes", async () => {
  await render();
  await click("http://localhost:3000/");
  state.machineId = "machine-b";
  await click("Stop");
  expect(state.requests).toEqual([]);
});
async function input(value: string) {
  const field = container.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it.each(["machine", "endpoint", "project"])(
  "invalidates %s changes after a rerender, keeps the draft, and never revives an old intent",
  async (kind) => {
    await render();
    await input("4000");
    await click("Start monitor");
    expect(container.textContent).toContain("http://localhost:4000/");
    if (kind === "machine") state.machineId = "machine-b";
    if (kind === "endpoint") state.endpoint = "https://repaired.synthetic.invalid";
    await render(kind === "project" ? "other-project" : "project");
    expect(container.textContent).toContain("Reopen this view");
    expect(container.querySelector("input")!.value).toBe("4000");
    await click("Start");
    await click("Refresh");
    expect(state.requests).toEqual([]);
    expect(state.refetch).not.toHaveBeenCalled();
    state.machineId = "machine-a";
    state.endpoint = "https://synthetic.invalid";
    await render();
    await click("Start");
    expect(state.requests).toEqual([]);
    expect(container.textContent).toContain("Reopen this view");
  },
);
it("validates inline and discloses the independent browser consequence before a start", async () => {
  await render();
  await input("ftp://example.invalid");
  await click("Start monitor");
  expect(container.textContent).toContain("Enter a port (1–65535)");
  expect(state.requests).toEqual([]);
  await input("4000");
  await click("Start monitor");
  expect(state.requests).toEqual([]);
  expect(container.textContent).toContain("keeps running after this screen closes until stopped");
  await click("Start");
  expect(state.requests).toEqual([
    {
      method: "runtimeLogs.monitors.start",
      params: { projectId: "project", url: "http://localhost:4000/" },
    },
  ]);
});
it("coalesces refresh and blocks writes until the list reconciles", async () => {
  let finish!: (value: { isError: boolean }) => void;
  state.refetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  await click("http://localhost:3000/");
  await click("Refresh");
  await click("Refresh");
  await click("Stop");
  expect(state.refetch).toHaveBeenCalledOnce();
  expect(state.requests).toEqual([]);
  await act(async () => finish({ isError: false }));
  expect([...container.querySelectorAll("button")].some((b) => b.textContent === "Stop")).toBe(
    false,
  );
});
