import type { SelectionOption } from "@/ui/selection-model";
import type { UsageLimitsReport } from "../../tools/usage-limits-model";
import { resetCountdown, wholePercent } from "../../tools/usage-limits-model";

import { SNAPSHOT_TTL_MS, WIDGET_SCHEME, type WidgetSnapshot } from "./snapshot";

/**
 * Pure usage-limits widget model. Only percentages, window names and reset times leave the
 * app: account labels, emails and provider model names never reach the widget payload.
 */
export type UsageWindowChoice = "both" | "session" | "weekly";
export const USAGE_WINDOW_CHOICES: readonly UsageWindowChoice[] = ["both", "session", "weekly"];
export type UsageWindowKind = "session" | "weekly";
export type UsageProvider = "codex" | "claude";

/** Fixed display order: Codex first, as the widget and settings present it. */
const PROVIDERS: readonly { id: UsageProvider; name: string }[] = [
  { id: "codex", name: "Codex" },
  { id: "claude", name: "Claude" },
];
const KINDS: readonly UsageWindowKind[] = ["session", "weekly"];
/** Below these left-percentages the bar and figure take the warning / danger tone. */
const WARNING_LEFT = 25;
const DANGER_LEFT = 10;

function usageTone(leftPercent: number): UsageWidgetRow["tone"] {
  if (leftPercent <= DANGER_LEFT) return "danger";
  if (leftPercent <= WARNING_LEFT) return "warning";
  return "normal";
}

export interface UsageWidgetLabels {
  title: string;
  session: string;
  weekly: string;
  left: string;
  /** Contains `{p0}` for the countdown, for example "3h 5m" -> "resets in 3h 5m". */
  resetIn: string;
  resetUnknown: string;
  empty: string;
  locked: string;
  setup: string;
  stale: string;
}

export interface UsageWidgetRow {
  id: string;
  provider: UsageProvider;
  providerName: string;
  kind: UsageWindowKind;
  label: string;
  /** Whole percent of the window still left (0-100). */
  leftPercent: number;
  /** Localized reset line, already formatted at publish time. */
  resetText: string;
  /** Bar and figure tone; computed here so widget bodies stay self-contained. */
  tone: "normal" | "warning" | "danger";
}

export interface UsageWidgetSnapshot {
  v: 1;
  state: "ready" | "locked" | "setup" | "empty";
  generatedAt: number;
  expiresAt: number;
  stale: boolean;
  rows: UsageWidgetRow[];
  labels: UsageWidgetLabels;
  palette: WidgetSnapshot["palette"];
  url: string;
}

export interface UsageWidgetInput {
  /** Unlocked and signed in: the same gate as the session widgets. */
  unlocked: boolean;
  /** The active computer; null when none is connected. */
  machine: { id: string } | null;
  /** Null while the report loads or cannot be read: the previous snapshot then stays. */
  report: UsageLimitsReport | null;
  windows: UsageWindowChoice;
  now: number;
  labels: UsageWidgetLabels;
  palette: WidgetSnapshot["palette"];
}

export function usageWidgetUrl(): string {
  return `${WIDGET_SCHEME}tools/usage`;
}

export function usageWidgetLabels(copy: (tr: string, en: string) => string): UsageWidgetLabels {
  return {
    title: copy("Kullanım limitleri", "Usage limits"),
    session: copy("5 saat", "5-hour"),
    weekly: copy("Haftalık", "Weekly"),
    left: copy("kaldı", "left"),
    resetIn: copy("{p0} içinde", "resets in {p0}"),
    resetUnknown: copy("Sıfırlanma zamanı bilinmiyor", "Reset time unknown"),
    empty: copy("Limit okunamadı.", "No limit readings."),
    locked: copy("Devam etmek için bycoda'yı aç", "Open bycoda to continue"),
    setup: copy("Bağlanmak için bycoda'yı aç", "Open bycoda to connect"),
    stale: copy("Yenilemek için bycoda'yı aç", "Open bycoda to refresh"),
  };
}

/** Settings choices for which windows the widget shows. */
export function usageWindowOptions(
  copy: (tr: string, en: string) => string,
): SelectionOption<UsageWindowChoice>[] {
  return [
    { value: "both", label: copy("İkisi", "Both") },
    { value: "session", label: copy("5 saat", "5-hour") },
    { value: "weekly", label: copy("Haftalık", "Weekly") },
  ];
}

function emptyState(
  input: UsageWidgetInput,
  state: UsageWidgetSnapshot["state"],
  generatedAt: number,
): UsageWidgetSnapshot {
  return {
    v: 1,
    state,
    generatedAt,
    expiresAt: generatedAt + SNAPSHOT_TTL_MS,
    stale: false,
    rows: [],
    labels: input.labels,
    palette: input.palette,
    url: usageWidgetUrl(),
  };
}

/** Rows follow the chosen windows; a window without a model-less reading is simply absent. */
function usageWidgetReadings(
  report: UsageLimitsReport,
  windows: UsageWindowChoice,
  now: number,
  labels: UsageWidgetLabels,
): { row: UsageWidgetRow; observedAt: number; failed: boolean }[] {
  const rows: { row: UsageWidgetRow; observedAt: number; failed: boolean }[] = [];
  for (const { id, name } of PROVIDERS) {
    const provider = report.providers.find((entry) => entry.provider === id);
    if (!provider) continue;
    for (const kind of KINDS) {
      if (windows !== "both" && windows !== kind) continue;
      const card = provider.cards.find((entry) => entry.kind === kind && entry.model === null);
      if (!card) continue;
      const countdown = resetCountdown(card.best.resetsAt, now);
      const account = provider.accounts.find((entry) => entry.id === card.accounts[0]?.id);
      rows.push({ row: {
        id: `${id}-${kind}`,
        provider: id,
        providerName: name,
        kind,
        label: kind === "session" ? labels.session : labels.weekly,
        leftPercent: wholePercent(card.best.leftPercent),
        resetText: countdown
          ? labels.resetIn.replace("{p0}", countdown)
          : labels.resetUnknown,
        tone: usageTone(wholePercent(card.best.leftPercent)),
      }, observedAt: account?.observedAt ?? report.sampledAt, failed: account?.status === "error" });
    }
  }
  return rows;
}

/**
 * `null` while the report is not available yet, so the last published snapshot keeps its
 * own expiry. Locked and setup states never carry readings.
 */
export function buildUsageWidgetSnapshot(input: UsageWidgetInput): UsageWidgetSnapshot | null {
  if (!input.unlocked) return emptyState(input, "locked", input.now);
  if (!input.machine) return emptyState(input, "setup", input.now);
  if (!input.report) return null;
  const readings = usageWidgetReadings(input.report, input.windows, input.now, input.labels);
  const rows = readings.map(({ row }) => row);
  const generatedAt = readings.length > 0
    ? Math.min(...readings.map(({ observedAt }) => observedAt))
    : input.report.sampledAt;
  return {
    ...emptyState(input, rows.length > 0 ? "ready" : "empty", generatedAt),
    stale: readings.some(({ failed }) => failed) || input.now >= generatedAt + SNAPSHOT_TTL_MS,
    rows,
  };
}

/** Everything except timing, so an unchanged reading is not published again. */
export function usageSnapshotIdentity(snapshot: UsageWidgetSnapshot): string {
  const { generatedAt: _generatedAt, expiresAt: _expiresAt, ...stable } = snapshot;
  return JSON.stringify(stable);
}

/** iOS timeline: the reading now and the same reading marked stale when it expires. */
export function usageWidgetTimeline(
  snapshot: UsageWidgetSnapshot,
): { date: Date; props: UsageWidgetSnapshot }[] {
  return [
    { date: new Date(snapshot.generatedAt), props: snapshot },
    { date: new Date(snapshot.expiresAt), props: { ...snapshot, stale: true } },
  ];
}

