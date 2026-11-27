import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { useActiveMachine } from "@/state/machines";
import { useSecurity } from "@/state/security";
import { useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";

import { readLimitsReport, type UsageLimitsReport } from "../../tools/usage-limits-model";
import { useAccountAccess } from "../../account/model/account-access";
import { widgetPalette } from "../model/palette";
import {
  buildUsageWidgetSnapshot,
  usageSnapshotIdentity,
  usageWidgetLabels,
  type UsageWidgetLabels,
} from "../model/usage-widget";
import { useUsageWidgetPreferences } from "../model/usage-widget-preferences";
import { publishUsageSnapshot } from "../platform/publish";
import { USAGE_WIDGET_POLL_MS, isUsagePollDue } from "./usage-widget-poll";

const DEBOUNCE_MS = 1_000;
/** Republish unchanged readings often enough that reset countdowns stay roughly current. */
const HEARTBEAT_MS = 4 * 60_000;

/**
 * Feeds the usage-limits widget from the same Host read the Tools screen uses (same query
 * key, so one request serves both). Like the session widgets it publishes only while
 * unlocked and signed in, and shows a locked state otherwise.
 */
export function useUsageWidgetPublisher() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const unlocked = useSecurity((state) => state.status === "unlocked");
  const signedIn = useAccountAccess((state) => state.status === "signedIn");
  const windows = useUsageWidgetPreferences((state) => state.windows);
  const hydrate = useUsageWidgetPreferences((state) => state.hydrate);
  const [beat, setBeat] = useState(0);
  const published = useRef({ identity: "", at: 0 });
  const gate = unlocked && signedIn;
  const supported = !!machine?.capabilities?.includes("usage.limits.read") && !!machine.environmentId;
  const environmentId = machine?.environmentId ?? "";
  const machineId = machine?.id ?? null;
  // Not auto-fetched: expo-widgets cannot tell whether a widget is placed, so the poll effect below
  // decides. The Tools usage screen keeps its own observer on the same key and its own interval.
  const { data, refetch, dataUpdatedAt } = useHostQuery<UsageLimitsReport>(
    ["usage-limits"],
    "usage.limits.read",
    {},
    {
      enabled: false,
      queryFn: async (client, signal) =>
        readLimitsReport(await client.request("usage.limits.read", {}, { signal }), environmentId),
    },
  );
  const report = data ?? null;
  const lastFetch = useRef(0);
  /** When the shared query last got data, from this poll or the Tools screen's own observer. */
  const dataAt = useRef(0);
  useEffect(() => {
    dataAt.current = dataUpdatedAt;
  }, [dataUpdatedAt]);

  useEffect(() => {
    // Reason: the poll must follow the foreground and unlock state, which react-query cannot gate here.
    const poll = (focused: boolean) => {
      const now = Date.now();
      if (!isUsagePollDue({ supported, gated: gate, focused, lastFetchAt: Math.max(lastFetch.current, dataAt.current), now })) return;
      lastFetch.current = now;
      // A failed read is kept in the query state; the next due poll retries it.
      void refetch().catch(() => {});
    };
    poll((AppState.currentState ?? "active") === "active");
    const subscription = AppState.addEventListener("change", (state) => poll(state === "active"));
    const timer = setInterval(
      () => poll((AppState.currentState ?? "active") === "active"),
      USAGE_WIDGET_POLL_MS,
    );
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [refetch, supported, gate]);
  const labels = usageWidgetLabels(copy);
  // Localized reset template travels as a string, so the effect depends on its content only.
  const labelsKey = JSON.stringify(labels);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const timer = setInterval(() => setBeat((value) => value + 1), HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const now = Date.now();
    const snapshot = buildUsageWidgetSnapshot({
      unlocked: gate,
      machine: machineId ? { id: machineId } : null,
      // A report from another computer never reaches the widget: readLimitsReport checks its id.
      report: report && report.environmentId === environmentId ? report : null,
      windows,
      now,
      labels: JSON.parse(labelsKey) as UsageWidgetLabels,
      palette: widgetPalette,
    });
    if (!snapshot) return;
    const identity = usageSnapshotIdentity(snapshot);
    const last = published.current;
    if (identity === last.identity && now - last.at < HEARTBEAT_MS) return;
    const timer = setTimeout(
      () => {
        published.current = { identity, at: Date.now() };
        void publishUsageSnapshot(snapshot).catch(() => {
          // A failed write is retried by the next change or heartbeat.
          published.current = { identity: "", at: 0 };
        });
      },
      snapshot.state === "ready" ? DEBOUNCE_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [gate, machineId, environmentId, report, windows, labelsKey, beat]);
}
