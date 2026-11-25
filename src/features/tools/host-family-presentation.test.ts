// @vitest-environment happy-dom
import { act, createElement, type PropsWithChildren, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/ui/no-computer", () => ({ NoComputerState: () => createElement("p", null, "Connect a computer first"), NoComputerGate: () => createElement("p", null, "Connect a computer first") }));
vi.mock("../workspace/project-picker", () => ({ ProjectPicker: () => null }));
vi.mock("@/ui/metric-value", () => ({ MetricValue: ({ children }: import("react").PropsWithChildren) => createElement("strong", null, children) }));
vi.mock("@/i18n", () => ({ useLocale: () => "en" }));
vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tanstack/react-query")>(),
  useQueryClient: () => ({ refetchQueries: vi.fn(async () => undefined) }),
  useIsFetching: () => 0,
}));
vi.mock("@/ui/info-hint", () => ({ useInfoHint: () => ({ button: null, panel: null }), HintSection: ({ children }: PropsWithChildren) => createElement("div", null, children), InfoHint: () => null, InfoPanel: () => null, HintLabel: () => null, UnitHint: () => null, isUnitHint: () => false }));
vi.mock("./usage-charts", () => ({ UsageKpis: () => null, ProviderShare: () => null }));
vi.mock("@/ui/machine-bar", () => ({ MachinePill: ({ accessory }: { accessory?: import("react").ReactNode }) => createElement("nav", null, accessory) }));
vi.mock("@/ui/usage-meters", () => ({ RemainingMeter: () => null, AccountMeter: () => null, CostKpi: () => null, DailyBars: () => null }));
vi.mock("@/ui/metric-row", () => ({ MetricRow: ({ label, value }: { label: string; value: string | number }) => createElement("div", null, label, ": ", value) }));

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
vi.mock("panelui-native/components/badge", () => ({ Badge: ({ children }: PropsWithChildren) => createElement("span", null, children) }));
vi.mock("react-native", () => ({
  StyleSheet: { hairlineWidth: 1 },
  View: ({ children }: PropsWithChildren) => createElement("div", null, children),
}));
vi.mock("expo-router", () => ({ Stack: { Screen: () => null }, useLocalSearchParams: () => ({ tab: "tokens" }), router: { setParams: vi.fn(), navigate: vi.fn() } }));
vi.mock("lucide-react-native/icons/network", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/smartphone", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/wifi", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/activity", () => ({ default: () => null }));
vi.mock("@/ui/icon-tile", () => ({ IconTile: () => null }));
vi.mock("panelui-native/components/meter", () => ({ Meter: () => null }));
vi.mock("lucide-react-native/icons/refresh-cw", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/list-video", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/settings-2", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/user-round", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/briefcase", () => ({ default: () => null }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: vi.fn(() => ({ mode: "dark", colors: {}, semanticColors: {}, uiStyles: { caption: {} } })) }));
vi.mock("@/ui/copy", () => ({ useCopy: () => (_tr: string, en: string) => en }));
vi.mock("@/ui/styles", () => ({ uiStyles: { caption: {} } }));
vi.mock("@/ui/tokens", () => ({ iconSize: { inline: 14, status: 16, row: 20, action: 20, back: 24 }, colors: {}, space: {}, fontSize: {}, radii: {} }));
vi.mock("@/ui/filter-sheet", () => ({ AppliedFilters: () => null,  FilterButton: () => null, FilterSheet: () => null }));
vi.mock("./runtime-monitors", () => ({ RuntimeMonitors: () => null }));
vi.mock("@/ui/message-code", () => ({ MessageCode: ({ code }: { code: string }) => createElement("pre", null, code) }));
vi.mock("@/ui/issue-summary", () => ({
  IssueSummary: ({ issues }: { issues: string[] }) => createElement("div", null, issues.join("\n")),
}));
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
                      publicUrl: "https://fixture.ngrok.app/",
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
  return { ValueRow: ({ label, value, trailing }: { label: string; value?: string; trailing?: import("react").ReactNode }) => createElement("div", null, label, value, trailing), RowIcon: () => null, StatusRow: ({label,children}: import("react").PropsWithChildren<{label:string}>) => createElement("div", null, label, children),
    Body: Wrapper,
    StatusText: ({ label }: { label: string }) => createElement("span", null, label),
    StateView: ({ title, description }: { title: string; description?: string }) => createElement("p", null, title, description),
    Card: Wrapper,
    CodePanel: Wrapper,
    CodeText: Wrapper,
    Row: Wrapper,
    ActionMenu: () => null,
    NavigationGroup: Wrapper,
    Disclosure: Wrapper,
    QueryState: () => null,
    SelectField: () => null, SegmentedControl: () => null, SectionHeader: () => null,
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
      metadata,
      trailing,
      supporting,
      accessibilityLabel,
      onPress,
    }: {
      label: string;
      detail?: string;
      metadata?: string;
      trailing?: ReactNode;
      supporting?: ReactNode;
      accessibilityLabel?: string;
      onPress: () => void;
    }) =>
      createElement(
        "button",
        { onClick: onPress, "aria-label": accessibilityLabel },
        label,
        detail,
        metadata,
        supporting,
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
    SearchToolbar: ({ search, actions }: any) => createElement("div", null, search, actions),
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
  expect(container.textContent).toContain("session-");
  expect(container.textContent).toContain("Provider fixture");
  expect(container.querySelectorAll("a")).toHaveLength(0);
});

it("includes the localized tunnel state in the visible badge and accessible name while retaining unverified reachability", async () => {
  await mount(createElement(AccessCenter));
  expect(container.textContent).toContain("Interrupted");
  expect(container.querySelector('[aria-label*="Interrupted"]')).not.toBeNull();
  expect(container.textContent).toContain("Public address reachability is unverified.");
});

vi.mock("@/ui/record-card", () => ({ RecordCard: ({ title, metadata, preview, details, footer, children }: { title: string; metadata?: string; preview?: import("react").ReactNode; details?: import("react").ReactNode; footer?: import("react").ReactNode; children?: import("react").ReactNode }) => createElement("section", null, createElement("h2", null, title), metadata, preview, details, children, footer) }));
