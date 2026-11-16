// @vitest-environment happy-dom
import {
  act,
  createElement,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DevServersScreen } from "./dev-servers-screen";
import { DevicesScreen } from "./devices-screen";
vi.mock("lucide-react-native/icons/wrench", () => ({ default: () => null }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("expo-crypto", () => { let id = 0; return { randomUUID: () => String(++id) }; });
const state = vi.hoisted(() => ({
  queries: {} as Record<string, unknown>,
  startResult: undefined as unknown,
  submit: vi.fn(async (_input: unknown) => ({ conflict: { port: 3000 } })),
}));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null } }));
vi.mock("lucide-react-native/icons/plus", () => ({ default: () => null }));
vi.mock("@/ui/duotone-icon", () => ({ Server: () => null, Smartphone: () => null }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("./dev-server-detail", () => ({ DevServerDetail: () => null }));
vi.mock("./device-runtime", () => ({ DeviceRuntime: () => null }));
vi.mock("./device-viewer", () => ({ DeviceViewer: () => null }));
vi.mock("@/ui/issue-summary", () => ({ IssueSummary: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: {} }) }));
vi.mock("@/ui/motion", () => ({ haptic: { success: vi.fn() } }));
vi.mock("@/ui/copy", () => ({
  useCopy: () => (_tr: string, en: string, params?: Record<string, unknown>) =>
    en.replace(/\{(\w+)\}/g, (match, key: string) =>
      String(params?.[key] ?? match),
    ),
}));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({ id: "machine", name: "Computer" }),
  useMachines: Object.assign(
    (select: (s: { activeId: string }) => unknown) =>
      select({ activeId: "machine" }),
    { getState: () => ({ activeId: "machine", machines: [{ id: "machine", name: "Computer" }] }), subscribe: () => () => {} },
  ),
}));
vi.mock("@/state/queries", () => ({
  useHostQuery: (_key: unknown, method: string) => ({
    data: state.queries[method],
    isSuccess: true,
    error: null,
  }),
  useHostMutation: () => ({
    data: state.startResult,
    isPending: false,
    error: null,
    reset: vi.fn(),
    mutateAsync: state.submit,
  }),
}));
vi.mock("@/ui/screen-list", () => ({
  ScreenList: ({
    header,
    actions,
    data,
    renderItem,
  }: {
    header: ReactNode;
    actions: ReactNode;
    data: unknown[];
    renderItem: (v: { item: unknown }) => ReactNode;
  }) =>
    createElement(
      "div",
      null,
      actions,
      header,
      data.map((item, i) =>
        createElement("div", { key: i }, renderItem({ item })),
      ),
    ),
}));
vi.mock("@/ui/primitives", async () => {
  const { ScreenList } = await import("@/ui/screen-list");
  const Button = ({
    label,
    disabled,
    onPress,
  }: {
    label: string;
    disabled?: boolean;
    onPress: () => void;
  }) => createElement("button", { disabled, onClick: onPress }, label);
  const Input = ({
    label,
    value,
    error,
    onChangeText,
  }: {
    label: string;
    value: string;
    error?: string;
    onChangeText: (v: string) => void;
  }) =>
    createElement(
      "label",
      null,
      label,
      createElement("input", {
        "aria-label": label,
        value,
        onChange: (e: { target: { value: string } }) =>
          onChangeText(e.target.value),
      }),
      error ? createElement("span", { "data-field-error": true }, error) : null,
    );
  return {
    ErrorText: ({ error }: any) => error ? createElement("p", null, String(error.message ?? error)) : null,
    ScreenList,
    Body: ({ children }: PropsWithChildren) =>
      createElement("span", null, children),
    Row: ({ children }: PropsWithChildren) => createElement("div", null, children),
    Disclosure: ({ children }: PropsWithChildren) => createElement("div", null, children),
    StatusText: ({ label }: { label: string }) => createElement("span", null, label),
    Field: Input,
    SearchField: Input,
    Button,
    IconButton: Button,
    ActionMenu: () => null,
    NavigationRow: ({ label }: { label: string }) =>
      createElement("p", null, label),
    Badge: () => null,
    MutationState: () => null,
    Notice: ({ message }: { message: string }) =>
      createElement("p", null, message),
    Sheet: ({ visible, children }: PropsWithChildren<{ visible: boolean }>) =>
      visible ? createElement("div", null, children) : null,
    QueryState: ({
      empty,
      emptyTitle,
      emptyAction,
    }: {
      empty?: boolean;
      emptyTitle?: string;
      emptyAction?: { label: string; onPress: () => void };
    }) => (empty ? createElement("div", null, emptyTitle,
      emptyAction ? createElement(Button, { label: emptyAction.label, onPress: emptyAction.onPress }) : null) : null),
    FormActions: ({
      feedback,
      submitLabel,
      disabled,
      onSubmit,
    }: {
      feedback: ReactNode;
      submitLabel: string;
      disabled: boolean;
      onSubmit: () => void;
    }) =>
      createElement(
        "div",
        { "data-form-actions": true },
        feedback,
        createElement(Button, {
          label: submitLabel,
          disabled,
          onPress: onSubmit,
        }),
      ),
  };
});
const container = document.createElement("div");
let root: ReturnType<typeof createRoot>;
const project = { id: "project", name: "Project", cwd: "/project" };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  state.queries = {
    "devServers.list": {
      status: "ok",
      servers: [
        {
          id: "server",
          projectId: "project",
          name: "Web server",
          command: "pnpm dev",
          endpoints: [],
          state: "running",
        },
      ],
    },
    "devices.status": { platforms: [] },
    "devices.list": {
      devices: [
        { id: "phone", name: "Phone", platform: "android", version: "16" },
      ],
      errors: [],
    },
  };
  state.startResult = undefined;
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function render(Screen: typeof DevServersScreen) {
  await act(async () => root.render(createElement(Screen, { project })));
}
async function input(label: string, value: string) {
  await act(async () => {
    const field = container.querySelector(`input[aria-label="${label}"]`)!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].filter(
    (b) => b.textContent === label,
  ).at(-1)!;
  expect(button).toBeDefined();
  await act(async () => button.click());
}
it.each([
  ["servers", DevServersScreen, "Search servers", "Web server"],
  ["devices", DevicesScreen, "Search devices", "Phone"],
] as const)(
  "distinguishes filtered empty and restores the existing collection: %s",
  async (_family, Screen, label, name) => {
    await render(Screen);
    await input(label, "not found");
    expect(container.textContent).toContain("No matching results");
    await click("Clear search");
    expect(container.textContent).toContain(name);
    expect(state.submit).not.toHaveBeenCalled();
  },
);
it("keeps invalid port beside its field and conflict beside the initiating action while retaining the draft", async () => {
  await render(DevServersScreen);
  await click("Start server");
  await input("Command", "pnpm dev");
  await input("Port (optional)", "70000");
  await click("Start server");
  expect(container.querySelector("[data-field-error]")?.textContent).toContain(
    "1 and 65535",
  );
  expect(state.submit).not.toHaveBeenCalled();
  await input("Port (optional)", "3000");
  expect(container.querySelector("[data-field-error]")).toBeNull();
  await click("Start server");
  expect(state.submit).toHaveBeenCalledExactlyOnceWith({
    projectId: "project",
    cwd: "/project",
    name: "pnpm dev",
    command: "pnpm dev",
    expectedPort: 3000,
  });
  state.startResult = { conflict: { port: 3000 } };
  await render(DevServersScreen);
  expect(container.querySelector("[data-form-actions]")?.textContent).toContain(
    "Port 3000 is already in use.",
  );
  expect(
    (container.querySelector('input[aria-label="Command"]') as HTMLInputElement)
      .value,
  ).toBe("pnpm dev");
});
