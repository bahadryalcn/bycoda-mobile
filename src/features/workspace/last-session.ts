import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRootNavigationState, type Href } from "expo-router";
import { openExternalEntry } from "../../ui/navigation";
import { useEffect } from "react";
import { Linking } from "react-native";
import { notifications } from "../permissions/device-permissions";
import { useMachines } from "../../state/machines";

/**
 * The session the phone was showing. Kept only while its screen is mounted, so a process the
 * OS reclaimed in the background can reopen it on the next cold start. Ids only: no content.
 */
export type LastSessionRoute = { machineId: string; projectId: string; id: string };

export const LAST_SESSION_KEY = "bycoda.mobile.last-session.v1";
const maxIdLength = 200;

export function decodeLastSessionRoute(raw: string | null): LastSessionRoute | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<Record<keyof LastSessionRoute, unknown>> | null;
    if (!data || typeof data !== "object") return null;
    const { machineId, projectId, id } = data;
    const valid = (value: unknown): value is string =>
      typeof value === "string" && value.length > 0 && value.length <= maxIdLength;
    if (!valid(machineId) || !valid(projectId) || !valid(id)) return null;
    return { machineId, projectId, id };
  } catch {
    return null;
  }
}

export type LastSessionRestoreInput = {
  stored: LastSessionRoute | null;
  machineIds: readonly string[];
  activeMachineId: string | null;
  /** An explicit deep link or a tapped notification owns the launch; nothing is restored over it. */
  initialUrl: string | null;
  launchedFromNotification: boolean;
};

/**
 * Returns the stored session only when it is still safe to reopen: the computer is still paired
 * and already active (identity is never switched implicitly), and the launch carries no target.
 */
export function lastSessionRestoreTarget(input: LastSessionRestoreInput): LastSessionRoute | null {
  const { stored } = input;
  if (!stored) return null;
  if (input.initialUrl || input.launchedFromNotification) return null;
  if (!input.machineIds.includes(stored.machineId)) return null;
  if (input.activeMachineId !== stored.machineId) return null;
  return stored;
}

// One queue keeps remember, forget and read in call order, so a leaving screen cannot erase
// the record a newly mounted screen just wrote (split tablets swap sessions via setParams).
let storageQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T | undefined> {
  const next = storageQueue.then(task).catch(() => undefined);
  storageQueue = next;
  return next;
}

export function rememberLastSession(route: LastSessionRoute): Promise<unknown> {
  return enqueue(() => AsyncStorage.setItem(LAST_SESSION_KEY, JSON.stringify(route)));
}

export function forgetLastSession(id: string): Promise<unknown> {
  return enqueue(async () => {
    const current = decodeLastSessionRoute(await AsyncStorage.getItem(LAST_SESSION_KEY));
    // Only clear the record of this session; a newer session may already own it.
    if (current?.id === id) await AsyncStorage.removeItem(LAST_SESSION_KEY);
  });
}

async function readLastSessionRoute(): Promise<LastSessionRoute | null> {
  const value = await enqueue(async () => decodeLastSessionRoute(await AsyncStorage.getItem(LAST_SESSION_KEY)));
  return value ?? null;
}

/** Keeps the mounted session's ids stored; leaving the screen clears them again. */
export function useRememberLastSession(id: string | undefined, projectId: string | undefined, machineId: string | undefined) {
  useEffect(() => {
    // Without all three ids there is nothing a later launch could reopen.
    if (!id || !projectId || !machineId) return;
    void rememberLastSession({ machineId, projectId, id });
    // Cleanup runs on leave and on param change; a process kill skips it, which is the point.
    return () => {
      void forgetLastSession(id);
    };
  }, [id, projectId, machineId]);
}

// Module scope: a warm return to the app keeps its own stack, so restore runs once per process.
let restoreState: "idle" | "started" | "suppressed" = "idle";

/** Remember the notification intent after Expo clears its native response cache. */
export function suppressLastSessionRestore() {
  restoreState = "suppressed";
}

async function launchedFromNotification(): Promise<boolean> {
  try {
    const api = await notifications();
    return !!(await api.getLastNotificationResponseAsync());
  } catch {
    // Without the native module (Expo Go, web) no notification can have launched the app.
    return false;
  }
}

async function restoreLastSession() {
  const [stored, initialUrl, fromNotification] = await Promise.all([
    readLastSessionRoute(),
    Linking.getInitialURL().catch(() => null),
    launchedFromNotification(),
  ]);
  if (restoreState === "suppressed") return;
  const machines = useMachines.getState();
  const target = lastSessionRestoreTarget({
    stored,
    machineIds: machines.machines.map((machine) => machine.id),
    activeMachineId: machines.activeId ?? null,
    initialUrl: initialUrl ?? null,
    launchedFromNotification: fromNotification,
  });
  if (!target) return;
  // From the launch position the Sessions list goes beneath, so Back returns to it.
  openExternalEntry({
    pathname: "/session/[id]",
    params: { id: target.id, projectId: target.projectId, machineId: target.machineId },
  } as Href, { push: true });
}

/**
 * Mounted under the unlocked app only (the security gate holds children until the first unlock),
 * so the reopened session never shows behind the lock.
 */
export function useRestoreLastSession() {
  const ready = !!useRootNavigationState()?.key;
  const hydrated = useMachines((state) => state.hydrated);
  useEffect(() => {
    // The router and the saved computers must exist before a stored id can be checked against them.
    if (restoreState !== "idle" || !ready || !hydrated) return;
    restoreState = "started";
    void restoreLastSession().catch(() => {
      // A failed restore leaves the normal Home screen, which is already on screen.
    });
  }, [ready, hydrated]);
}
