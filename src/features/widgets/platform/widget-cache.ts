import AsyncStorage from "@react-native-async-storage/async-storage";
import { WIDGET_CACHE_KEY, type WidgetCache } from "../model/background-snapshot";
import {
  buildWidgetSnapshot,
  widgetCacheContent,
  type BuildSnapshotInput,
  type WidgetSnapshot,
} from "../model/snapshot";
import { publishWidgetSnapshot } from "./publish";

let tail: Promise<unknown> = Promise.resolve();
let generation = 0;
export function invalidateWidgetWork() {
  generation++;
}
export function widgetWorkGeneration() {
  return generation;
}
/** Called synchronously by account/lock/computer subscriptions before React's next render. */
export function revokeWidgetCache(): Promise<void> {
  invalidateWidgetWork();
  return withWidgetStorage(async () => {
    const raw = await AsyncStorage.getItem(WIDGET_CACHE_KEY);
    if (!raw) return;
    const cache = JSON.parse(raw) as WidgetCache;
    cache.backgroundAllowed = false;
    cache.sessions = [];
    cache.projects = [];
    cache.snapshot = buildWidgetSnapshot({
      machine: null,
      unlocked: false,
      ready: false,
      sessions: [],
      showTitles: false,
      showQuestionText: false,
      now: Date.now(),
      labels: cache.snapshot.labels,
      palette: cache.snapshot.palette,
    })!;
    await publishWidgetSnapshot(cache.snapshot);
    await AsyncStorage.setItem(WIDGET_CACHE_KEY, JSON.stringify(cache));
  });
}
export function withWidgetStorage<T>(operation: () => Promise<T>): Promise<T> {
  const result = tail.catch(() => undefined).then(operation);
  tail = result.catch(() => undefined);
  return result;
}

/** Persist only data that passed the single privacy gate, including opt-in question text. */
export function publishAndCacheWidget(
  input: BuildSnapshotInput,
  snapshot: WidgetSnapshot,
  environmentId: string,
  backgroundAllowed: boolean,
): Promise<void> {
  const expected = generation;
  return withWidgetStorage(async () => {
    if (expected !== generation) return;
    // Native redaction must not wait for (or fail with) local cache persistence.
    if (snapshot.state !== "ready")
      await publishWidgetSnapshot(snapshot, () => expected === generation);
    const { sessions, projects } = widgetCacheContent(input);
    const cache: WidgetCache = {
      environmentId,
      machineId: input.machine?.id ?? "",
      machineName: snapshot.machineName,
      backgroundAllowed,
      showTitles: input.showTitles,
      showQuestionText: input.showQuestionText === true,
      locale: input.locale,
      sessions,
      projects,
      snapshot,
      lastPushAt: input.now,
    };
    await AsyncStorage.setItem(WIDGET_CACHE_KEY, JSON.stringify(cache));
    if (expected !== generation) return;
    if (snapshot.state === "ready")
      await publishWidgetSnapshot(snapshot, () => expected === generation);
  });
}
