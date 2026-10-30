// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  search: undefined as undefined | ((text: string) => void),
  queries: [] as { method: string; enabled?: boolean; search?: string }[],
}));
const log = {
  id: "entry",
  projectId: "project",
  message: "Fixture event",
  timestamp: 1,
  source: "fixture",
  sourceId: "fixture",
  level: "info",
  details: "x".repeat(16_001),
};
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null } }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: vi.fn() }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/styles", () => ({ uiStyles: { caption: {} } }));
vi.mock("@/ui/tokens", () => ({ colors: {}, space: {} }));
vi.mock("@/ui/filter-sheet", () => ({ FilterButton: () => null, FilterSheet: () => null }));
vi.mock("./runtime-monitors", () => ({ RuntimeMonitors: () => null }));
vi.mock("../management/shared/format", () => ({ stamp: () => "Fixture time" }));
vi.mock("./access-device", () => ({ AccessDevice: () => null }));
vi.mock("./access-tunnels", () => ({ AccessTunnels: () => null }));
vi.mock("@/state/machines", () => ({
  useActiveMachine: () => ({
    id: "machine",
    environmentId: "env",
    name: "Fixture computer",
    capabilities: ["host.access.read", "usage.sessions.read"],
  }),
}));
vi.mock("@/state/queries", () => ({
  useHostQuery: (
    _keys: unknown,
    method: string,
    params: { search?: string },
    options?: { enabled?: boolean },
  ) => {
    f.queries.push({ method, enabled: options?.enabled, search: params.search });
    const metrics = {
      turns: 0,
      timedTurns: 0,
      durationMs: null,
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      cost: null,
    };
    const data =
      method === "runtimeLogs.sources"
        ? []
        : method === "runtimeLogs.read"
          ? { entries: [log] }
          : method === "usage.sessions.read"
            ? {
                rows: [{ ...metrics, sessionId: "session-fixture", provider: "Provider fixture" }],
                totals: metrics,
                coverage: {},
                sampledAt: 1,
              }
            : {
                devices: [],
                tunnels: {
                  tunnels: [
                    {
                      id: "tunnel",
                      provider: "ngrok",
                      target: "host",
                      state: "interrupted",
                      localUrl: "http://127.0.0.1:3777",
                    },
                  ],
                },
                lan: { state: "ready" },
                privateNetwork: { state: "offline" },
              };
    return { data, isSuccess: true, isFetching: false, isPending: false, refetch: vi.fn() };
  },
}));
vi.mock("@/ui/primitives", () => {
  const Wrapper = ({ children }: PropsWithChildren) => createElement("div", null, children);
  return {
    Body: Wrapper,
    Card: Wrapper,
    CodePanel: Wrapper,
    CodeText: Wrapper,
    Row: Wrapper,
    NavigationGroup: Wrapper,
    Disclosure: Wrapper,
    QueryState: () => null,
    SelectField: () => null,
    ToggleField: () => null,
    Empty: () => null,
    Sheet: ({ visible, children }: PropsWithChildren<{ visible: boolean }>) =>
      visible ? createElement("section", null, children) : null,
    ScreenList: ({
      header,
      footer,
      data,
      renderItem,
    }: {
      header: ReactNode;
      footer?: ReactNode;
      data: unknown[];
      renderItem: (input: { item: unknown }) => ReactNode;
    }) =>
      createElement(
        "main",
        null,
        header,
        ...data.map((item, index) => createElement("div", { key: index }, renderItem({ item }))),
        footer,
      ),
    Notice: ({ message }: { message: string }) => createElement("p", null, message),
    ErrorText: ({ error }: { error: string }) => createElement("p", { role: "alert" }, error),
    Badge: ({ label }: { label: string }) => createElement("span", null, label),
    NavigationRow: ({
      label,
      detail,
      trailing,
      accessibilityLabel,
      onPress,
    }: {
      label: string;
      detail?: string;
      trailing?: ReactNode;
      accessibilityLabel?: string;
      onPress: () => void;
    }) =>
      createElement(
        "button",
        { onClick: onPress, "aria-label": accessibilityLabel },
        label,
        detail,
        trailing,
      ),
    Button: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => void;
      disabled?: boolean;
    }) => createElement("button", { onClick: onPress, disabled }, label),
    IconButton: () => null,
    SearchField: ({
      onChangeText,
      maxLength,
    }: {
      onChangeText: (value: string) => void;
      maxLength: number;
    }) => {
      f.search = onChangeText;
      return createElement("input", { maxLength });
    },
  };
});
import { RuntimeLogsScreen } from "./runtime-logs-screen";
import { UsageScreen } from "./usage-screen";
import { AccessCenter } from "./access-center";

let root: ReturnType<typeof createRoot> | undefined;
const container = document.createElement("div");
async function mount(node: ReactNode) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(container);
  await act(async () => root!.render(node));
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  f.queries = [];
  f.search = undefined;
  vi.unstubAllGlobals();
});

it("discloses structured log truncation only in the selected detail and refuses an oversized effective filter", async () => {
  await mount(
    createElement(RuntimeLogsScreen, {
      project: { id: "project", name: "Fixture", cwd: "/fixture" },
    }),
  );
  expect(container.querySelector("input")?.maxLength).toBe(512);
  expect(container.textContent).not.toContain("Log search supports up to 512 characters.");
  await act(async () => f.search!("x".repeat(448)));
  expect(container.textContent).toContain("Log search supports up to 512 characters.");
  expect(container.textContent).not.toContain("Showing the first 16,000");
  await act(async () =>
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.startsWith("Fixture event"))!
      .click(),
  );
  expect(container.textContent).toContain("Showing the first 16,000 characters of details.");
  f.queries = [];
  await act(async () => f.search!("x".repeat(513)));
  expect(container.textContent).toContain("Shorten the search to 512 characters or fewer.");
  expect(f.queries.filter((value) => value.method === "runtimeLogs.read").at(-1)).toMatchObject({
    enabled: false,
  });
  expect(
    [...container.querySelectorAll("button")].some((button) =>
      button.textContent?.startsWith("Fixture event"),
    ),
  ).toBe(false);
});

it("shows the provider already present in the usage row without opening a session", async () => {
  await mount(
    createElement(UsageScreen, { project: { id: "project", name: "Fixture", cwd: "/fixture" } }),
  );
  expect(container.textContent).toContain("session-fixture");
  expect([...container.querySelectorAll("h2")].map((heading) => heading.textContent)).toContain("Provider fixture");
  expect(container.querySelectorAll("a")).toHaveLength(0);
});

it("includes the localized tunnel state in the visible badge and accessible name while retaining unverified reachability", async () => {
  await mount(createElement(AccessCenter));
  expect(container.textContent).toContain("Interrupted");
  expect(container.querySelector('[aria-label*="Interrupted"]')).not.toBeNull();
  expect(container.textContent).toContain("Public address reachability is unverified.");
});

vi.mock("@/ui/record-card", () => ({ RecordCard: ({ title, metadata, preview, details, footer, children }: { title: string; metadata?: string; preview?: import("react").ReactNode; details?: import("react").ReactNode; footer?: import("react").ReactNode; children?: import("react").ReactNode }) => createElement("section", null, createElement("h2", null, title), metadata, preview, details, children, footer) }));
