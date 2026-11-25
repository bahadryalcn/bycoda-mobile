// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  endpoint: "http://fixture",
  supported: true,
  metadata: true,
  error: false,
  empty: false,
  refetch: vi.fn(),
  pull: undefined as undefined | (() => unknown),
  methods: [] as string[],
  pending: [] as Promise<unknown>[],
  limits: false,
  navigate: vi.fn(),
}));
vi.mock("@/ui/provider-account-kind", () => ({ ProviderAccountKind: () => null }));
vi.mock("./provider-account-editor", () => ({ ProviderAccountEditor: () => null }));
vi.mock("react-native", () => ({ View: "div" }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({ colors: {} }) }));
vi.mock("expo-router", () => ({ router: { navigate: state.navigate } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
const machine = () => ({
  id: "machine",
  endpoint: state.endpoint,
  environmentId: "host",
  capabilities: state.supported
    ? [
        "providers.desktop.v1",
        ...(state.limits ? ["usage.limits.read", "usage.sessions.read"] : []),
        ...(state.metadata
          ? ["providers.desktop.metadata.v1"]
          : ["providers.desktop.quotaRefresh.v1"]),
      ]
    : [],
});
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => machine(),
  useMachines: { getState: () => ({ activeId: "machine", machines: [machine()] }) },
}));
vi.mock("@/state/queries", () => ({
  useHostQuery: (
    _key: unknown,
    _method: string,
    _params: unknown,
    options: {
      enabled: boolean;
      queryFn: (client: unknown, signal: AbortSignal) => Promise<unknown>;
    },
  ) => {
    if (options.enabled)
      state.pending.push(
        options.queryFn(
          {
            request: async (method: string) => {
              state.methods.push(method);
              return fixture();
            },
          },
          new AbortController().signal,
        ),
      );
    return {
      data: fixture(),
      error: state.error ? new Error("cached read failed") : undefined,
      isError: state.error,
      isFetching: false,
      refetch: state.refetch,
      isSuccess: !state.error,
    };
  },
}));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: { children: import("react").ReactNode }) =>
    createElement("div", null, children);
  return {
    Body: Wrapper,
    Row: Wrapper,
    Badge: ({ label }: { label: string }) => createElement("span", null, label),
    StatusText: ({ label }: { label: string }) => createElement("span", null, label),
    StateView: ({ title }: { title: string }) => createElement("p", null, title),
    IconButton: ({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) =>
      createElement("button", { disabled, onClick: onPress }, label),
    NavigationRow: ({ label, onPress }: { label: string; onPress: () => void }) =>
      createElement("button", { onClick: onPress }, label),
    Disclosure: Wrapper,
    Empty: ({ title }: { title: string }) => createElement("p", null, title),
    Sheet: Wrapper,
    QueryState: () => null,
    Notice: ({ message }: { message: string }) => createElement("div", null, message),
    Button: ({
      label,
      disabled,
      onPress,
    }: {
      label: string;
      disabled: boolean;
      onPress: () => void;
    }) => createElement("button", { disabled, onClick: onPress }, label),
    ScreenList: ({
      header,
      actions,
      refreshState,
      data,
      renderItem,
    }: {
      header: import("react").ReactNode;
      actions?: import("react").ReactNode;
      refreshState?: { onRefresh: () => unknown };
      data: unknown[];
      renderItem: (arg: { item: unknown }) => import("react").ReactNode;
    }) => {
      state.pull = refreshState?.onRefresh;
      return createElement("div", null, actions, header, ...data.map((item) => renderItem({ item })));
    },
  };
});
const fixture = () => ({
  environmentId: "host",
  sourceSessionId: "session",
  projectCwd: "/project",
  workingCwd: "/project",
  sampledAt: 7,
  revision: "a".repeat(64),
  accountRevision: "a".repeat(64),
  accounts: state.empty
    ? []
    : [
        {
          provider: "claude",
          id: "default",
          label: "Fixture account",
          color: null,
          isDefault: true,
          quota: {
            status: "unavailable",
            updatedAt: 0,
            session: null,
            weekly: null,
            monthly: null,
            renewalPending: false,
          },
        },
      ],
  mcp: state.empty
    ? []
    : [
        {
          provider: "claude",
          name: "Fixture docs",
          scope: "project",
          transport: "stdio",
          enabled: false,
        },
      ],
  coverage: {
    accountMetadata: "desktop-owner",
    quotaSource: "desktop-cache",
    mcpSource: "desktop-cache",
    truncated: false,
  },
});
import { ProviderDesktop } from "./provider-desktop";
let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement;
async function render() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  if (!root) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () =>
    root!.render(
      createElement(ProviderDesktop, {
        scope: { machineId: "machine", sessionId: "session" },
        projectId: "project",
        onClose: vi.fn(),
      }),
    ),
  );
  await Promise.all(state.pending);
  state.pending = [];
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  state.methods = [];
  state.pending = [];
  state.supported = true;
  state.metadata = true;
  state.limits = false;
  state.navigate.mockReset();
  state.error = false;
  state.empty = false;
  state.refetch.mockReset();
  state.pull = undefined;
  state.endpoint = "http://fixture";
  vi.unstubAllGlobals();
});
it("renders cached account/MCP metadata through the finite read only", async () => {
  await render();
  expect(state.methods).toEqual(["providers.desktop.read"]);
  expect(container.textContent).toContain("Fixture account");
  expect(container.textContent).toContain("Fixture docs");
  expect(container.textContent).toContain("Quota information unavailable");
  expect(container.textContent).toContain("Account actions");
  expect(container.textContent).not.toContain("Account display settings");
});
it("hides cached private rows for an old host and same-id replacement endpoint", async () => {
  state.supported = false;
  await render();
  expect(state.methods).toEqual([]);
  expect(container.textContent).not.toContain("Fixture account");
  state.supported = true;
  await render();
  expect(container.textContent).toContain("Fixture account");
  const calls = state.methods.length;
  state.endpoint = "http://replacement";
  await render();
  expect(state.methods).toHaveLength(calls);
  expect(container.textContent).not.toContain("Fixture account");
});

vi.mock("@/ui/record-card", () => ({
  RecordCard: ({
    title,
    metadata,
    preview,
    details,
    footer,
    children,
  }: {
    title: string;
    metadata?: string;
    preview?: import("react").ReactNode;
    details?: import("react").ReactNode;
    footer?: import("react").ReactNode;
    children?: import("react").ReactNode;
  }) =>
    createElement(
      "section",
      null,
      createElement("h2", null, title),
      metadata,
      preview,
      details,
      children,
      footer,
    ),
}));

it("does not revive a retired connection when its previous endpoint returns", async () => {
  await render();
  state.endpoint = "http://replacement";
  await render();
  const calls = state.methods.length;
  state.endpoint = "http://fixture";
  await render();
  expect(state.methods).toHaveLength(calls);
  expect(container.textContent).not.toContain("Fixture account");
  expect(container.textContent).toContain("connection or project changed");
  expect(state.pull).toBeUndefined();
});
it("gives failed cached reads priority over empty success messages", async () => {
  state.empty = true;
  state.error = true;
  await render();
  expect(container.textContent).not.toContain("No configured accounts.");
  expect(container.textContent).not.toContain("No cached MCP servers.");
  state.error = false;
  await render();
  expect(container.textContent).toContain("No configured accounts.");
  expect(container.textContent).toContain("No cached MCP servers.");
});
it("coalesces toolbar and pull refresh into one read", async () => {
  let release!: () => void;
  state.refetch.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await render();
  await act(async () => {
    [...container.querySelectorAll("button")].find((b) => b.textContent === "Refresh")!.click();
    void state.pull?.();
  });
  expect(state.refetch).toHaveBeenCalledOnce();
  await act(async () => release());
});

it("exposes Claude account actions when only quota observation is supported", async () => {
  state.metadata = false;
  await render();
  expect(container.textContent).toContain("Account actions");
});
it("replaces the cached quota with a link to Usage Limits in the same machine and project scope", async () => {
  state.limits = true;
  await render();
  expect(container.textContent).not.toContain("Quota information unavailable");
  const link = [...container.querySelectorAll("button")].find((b) => b.textContent === "Account limits")!;
  await act(async () => link.click());
  expect(state.navigate).toHaveBeenCalledWith({
    pathname: "/tools/[tool]",
    params: { tool: "usage", projectId: "project", machineId: "machine", tab: "limits" },
  });
});
