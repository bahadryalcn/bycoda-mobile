import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({ useMutation: () => ({}), useQueryClient: () => ({}) }));
vi.mock("expo-crypto", () => ({}));
vi.mock("@/state/queries", () => ({ useHostClient: () => ({}) }));
vi.mock("@/state/machines", () => ({ useActiveMachine: () => undefined }));
vi.mock("@/ui/primitives", () => ({}));
vi.mock("@/ui/tokens", () => ({ radii: {}, space: { row: 12 } }));
vi.mock("@/ui/copy", () => ({ useCopy: () => undefined }));
vi.mock("@/ui/theme", () => ({ useMobileTheme: () => ({}) }));
vi.mock("react-native", () => ({ View: () => null }));
vi.mock("panelui-native/components/badge", () => ({ Badge: () => null }));
vi.mock("../management/shared/format", () => ({
  shortDate: (value: number, now: number) =>
    new Date(value).getFullYear() === new Date(now).getFullYear() ? "short" : "short+year",
}));
vi.mock("./commands", () => ({ dispatchCommand: () => undefined, UncertainCommand: () => null }));
vi.mock("./project-cache", () => ({ isProjectWorkspaceQuery: () => false }));
vi.mock("./command-cache", () => ({ invalidateCommandQueries: () => undefined }));

const { relativeTime, sessionStatus } = await import("./shared");
const copy = ((_tr: string, en: string, values?: Record<string, unknown>) =>
  en.replace("{p0}", String(values?.p0 ?? ""))) as Parameters<typeof relativeTime>[1];
const now = Date.UTC(2026, 10, 10, 12);
const ago = (ms: number) => now - ms;
const DAY = 86_400_000;

it("keeps failed idle sessions distinct from Ready while current running/input state wins", () => {
  const colors = {
    danger: "danger",
    muted: "muted",
    live: "live",
    warning: "warning",
  } as Parameters<typeof sessionStatus>[2];
  const failed = { needsInput: false, status: "idle", pinned: false, issue: "failed" } as const;
  expect(sessionStatus(failed, copy, colors)).toEqual({ label: "Failed", color: "danger" });
  expect(sessionStatus({ ...failed, issue: undefined }, copy, colors)).toEqual({
    label: "Ready",
    color: "muted",
  });
  expect(sessionStatus({ ...failed, status: "running" }, copy, colors)).toEqual({
    label: "Working",
    color: "live",
  });
  expect(sessionStatus({ ...failed, needsInput: true }, copy, colors)).toEqual({
    label: "Needs input",
    color: "warning",
  });
});

describe("relativeTime", () => {
  it("counts minutes, hours and days inside a week", () => {
    expect(relativeTime(ago(10_000), copy, now)).toBe("Now");
    expect(relativeTime(ago(5 * 60_000), copy, now)).toBe("5 min");
    expect(relativeTime(ago(3 * 3_600_000), copy, now)).toBe("3 h");
    expect(relativeTime(ago(6 * DAY), copy, now)).toBe("6 d");
  });
  it("counts whole elapsed units like desktop instead of rounding up", () => {
    expect(relativeTime(ago(90 * 60_000), copy, now)).toBe("1 h");
    expect(relativeTime(ago(36 * 3_600_000), copy, now)).toBe("1 d");
  });
  it("switches to a short date at seven days", () => {
    expect(relativeTime(ago(7 * DAY), copy, now)).toBe("short");
    expect(relativeTime(ago(30 * DAY), copy, now)).toBe("short");
  });
  it("adds the year only for another calendar year", () => {
    expect(relativeTime(Date.UTC(2025, 11, 30), copy, now)).toBe("short+year");
  });
  it("hides missing stamps", () => {
    expect(relativeTime(undefined, copy, now)).toBe("");
  });
});
