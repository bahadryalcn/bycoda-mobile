import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));

import type { UsageLimitsReport } from "../../tools/usage-limits-model";
import { SNAPSHOT_TTL_MS } from "./snapshot";
import { widgetPalette } from "./palette";
import {
  buildUsageWidgetSnapshot,
  usageSnapshotIdentity,
  usageWidgetTimeline,
  usageWindowOptions,
  type UsageWidgetLabels,
} from "./usage-widget";
import { decodeUsageWindows } from "./usage-widget-preferences";

const now = 1_700_000_000_000;
const labels: UsageWidgetLabels = {
  title: "Usage limits",
  session: "5-hour",
  weekly: "Weekly",
  left: "left",
  resetIn: "resets in {p0}",
  resetUnknown: "Reset time unknown",
  empty: "No limit readings.",
  locked: "Open bycoda to continue",
  setup: "Open bycoda to connect",
  stale: "Open bycoda to refresh",
};
const machine = { id: "machine-1" };
const reading = (leftPercent: number, resetsAt: number | null) => ({
  usedPercent: 100 - leftPercent,
  leftPercent,
  regainPercent: 100 - leftPercent,
  windowMinutes: 300,
  resetsAt,
  timeLeftPercent: null,
  pace: null,
});
const account = "person@example.com";
const report = {
  environmentId: "env-1",
  sampledAt: now,
  source: "host-provider-api",
  providers: [
    {
      provider: "claude",
      accounts: [],
      cards: [
        {
          key: "claude-session",
          kind: "session",
          model: null,
          best: reading(72.4, now + 3 * 3_600_000 + 5 * 60_000),
          accounts: [{ id: "a", label: account, color: "#fff", reading: reading(72.4, null) }],
        },
        {
          key: "claude-weekly",
          kind: "weekly",
          model: null,
          best: reading(8, now + 4 * 86_400_000 + 12 * 3_600_000),
          accounts: [],
        },
        {
          key: "claude-opus",
          kind: "weekly",
          model: "opus",
          best: reading(1, null),
          accounts: [],
        },
      ],
    },
    {
      provider: "codex",
      accounts: [],
      cards: [
        { key: "codex-session", kind: "session", model: null, best: reading(50, null), accounts: [] },
        { key: "codex-weekly", kind: "weekly", model: null, best: reading(20, null), accounts: [] },
      ],
    },
  ],
} as unknown as UsageLimitsReport;

function build(overrides: Partial<Parameters<typeof buildUsageWidgetSnapshot>[0]> = {}) {
  return buildUsageWidgetSnapshot({
    unlocked: true,
    machine,
    report,
    windows: "both",
    now,
    labels,
    palette: widgetPalette,
    ...overrides,
  });
}

describe("usage widget snapshot", () => {
  it("lists Codex before Claude, session before weekly, and skips model-specific cards", () => {
    const snapshot = build()!;
    expect(snapshot.state).toBe("ready");
    expect(snapshot.rows.map((row) => row.id)).toEqual([
      "codex-session",
      "codex-weekly",
      "claude-session",
      "claude-weekly",
    ]);
  });

  it("maps percentages to whole numbers and formats reset countdowns", () => {
    const rows = build()!.rows;
    const claudeSession = rows.find((row) => row.id === "claude-session")!;
    expect(claudeSession).toMatchObject({
      leftPercent: 72,
      label: "5-hour",
      providerName: "Claude",
      resetText: "resets in 3h 5m",
      tone: "normal",
    });
    expect(rows.find((row) => row.id === "claude-weekly")).toMatchObject({
      leftPercent: 8,
      resetText: "resets in 4d 12h",
      tone: "danger",
    });
    expect(rows.find((row) => row.id === "codex-weekly")!.tone).toBe("warning");
  });

  it("shows the reset-unknown text when the provider gave no reset time", () => {
    const codex = build()!.rows.find((row) => row.id === "codex-session")!;
    expect(codex.resetText).toBe("Reset time unknown");
  });

  it("filters rows to the chosen window", () => {
    expect(build({ windows: "session" })!.rows.map((row) => row.kind)).toEqual([
      "session",
      "session",
    ]);
    expect(build({ windows: "weekly" })!.rows.map((row) => row.kind)).toEqual([
      "weekly",
      "weekly",
    ]);
  });

  it("never carries account labels into the widget payload", () => {
    expect(JSON.stringify(build())).not.toContain(account);
  });

  it("reports locked and setup states without any readings", () => {
    expect(build({ unlocked: false })).toMatchObject({ state: "locked", rows: [], generatedAt: now });
    expect(build({ machine: null })).toMatchObject({ state: "setup", rows: [] });
  });

  it("keeps the previous snapshot while no report is available", () => {
    expect(build({ report: null })).toBeNull();
  });

  it("is empty when the report has no usable model-less window", () => {
    const empty = { ...report, providers: [] } as unknown as UsageLimitsReport;
    expect(build({ report: empty })).toMatchObject({ state: "empty", rows: [] });
  });

  it("expires ten minutes after the reading was sampled", () => {
    expect(build()!.expiresAt).toBe(now + SNAPSHOT_TTL_MS);
  });

  it("builds a live entry and a stale entry, and ignores timing in the identity", () => {
    const snapshot = build()!;
    const [live, stale] = usageWidgetTimeline(snapshot);
    expect(live.props.stale).toBe(false);
    expect(stale.props.stale).toBe(true);
    expect(stale.date.getTime()).toBe(snapshot.expiresAt);
    expect(usageSnapshotIdentity({ ...snapshot, generatedAt: now + 1, expiresAt: 0 })).toBe(
      usageSnapshotIdentity(snapshot),
    );
  });

  it("offers the three window choices", () => {
    expect(usageWindowOptions((_tr, en) => en).map((option) => option.value)).toEqual([
      "both",
      "session",
      "weekly",
    ]);
  });
});

describe("usage widget preference decoding", () => {
  it("defaults to both windows for missing, corrupt or unknown values", () => {
    expect(decodeUsageWindows(null)).toBe("both");
    expect(decodeUsageWindows("{not json")).toBe("both");
    expect(decodeUsageWindows('{"windows":"monthly"}')).toBe("both");
    expect(decodeUsageWindows("5")).toBe("both");
  });

  it("reads a stored choice", () => {
    expect(decodeUsageWindows('{"windows":"weekly"}')).toBe("weekly");
  });
});
