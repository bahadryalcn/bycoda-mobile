import { AppState } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
import type { SecurityState } from "./security-types";
import {
  encodeSecurityPreferences,
  isAutoLockTimeout,
  isWithinLockGrace,
  legacySecurityPreferenceKey,
  migrateSecurityPreference,
  parseSecurityPreferences,
  securityPreferenceKey,
  suspensionTime,
  type SecurityPreferences,
  type SuspensionTime,
} from "./security-preferences";

const native = process.env.EXPO_OS !== "web";
let initialization: Promise<void> | null = null;
let storageTail: Promise<unknown> = Promise.resolve();
let generation = 0;
let authenticating = false;
let suspendedAt: SuspensionTime | null = null;

function withSecureStorage<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageTail.then(operation);
  storageTail = result.catch(() => undefined);
  return result;
}

function savePreferences(preferences: SecurityPreferences) {
  return SecureStore.setItemAsync(
    securityPreferenceKey,
    encodeSecurityPreferences(preferences),
    {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    },
  );
}

function isForeground() {
  const state = useSecurity.getState();
  return (
    AppState.currentState === "active" &&
    state.appState === "active" &&
    state.windowFocused
  );
}

function isCurrentAuthentication(attempt: number) {
  return attempt === generation && isForeground();
}

async function foreground() {
  if (isForeground()) return true;
  return new Promise<boolean>((resolve) => {
    const check = () => {
      if (isForeground()) finish(true);
    };
    const subscription = AppState.addEventListener("change", check);
    const unsubscribe = useSecurity.subscribe(check);
    const timer = setTimeout(() => finish(false), 1_500);
    function finish(value: boolean) {
      clearTimeout(timer);
      subscription.remove();
      unsubscribe();
      resolve(value);
    }
    check();
  });
}

async function authenticate(prompt: string) {
  const state = useSecurity.getState();
  if (state.busy || !native) return null;
  const attempt = ++generation;
  let verified = false;
  authenticating = true;
  useSecurity.setState({ busy: true, error: null });
  try {
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (attempt !== generation) return null;
    if (level < LocalAuthentication.SecurityLevel.SECRET) {
      useSecurity.setState({ available: false, error: "not-secured" });
      return null;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      biometricsSecurityLevel: "strong",
      disableDeviceFallback: false,
    });
    if (attempt !== generation) return null;
    if (!result.success) {
      useSecurity.setState({
        error: ["user_cancel", "app_cancel", "system_cancel"].includes(
          result.error,
        )
          ? "cancelled"
          : "failed",
      });
      return null;
    }
    // Android success can arrive before its PIN/biometric window gives focus back.
    if (!(await foreground()) || !isCurrentAuthentication(attempt)) {
      if (attempt === generation) useSecurity.setState({ error: "background" });
      return null;
    }
    verified = true;
    return attempt;
  } catch {
    if (attempt === generation) useSecurity.setState({ error: "failed" });
    return null;
  } finally {
    authenticating = false;
    // A verified operation stays single-flight through the caller's atomic commit.
    if (!verified) useSecurity.setState({ busy: false });
  }
}

async function changePreferences(
  preferences: SecurityPreferences,
  prompt: string,
) {
  const attempt = await authenticate(prompt);
  if (attempt === null) return;
  if (!isCurrentAuthentication(attempt)) {
    suspendedAt = null;
    useSecurity.setState({
      status: "locked",
      error: "background",
      busy: false,
    });
    return;
  }
  // Keep authentication and all secure preference reads/writes single-flight.
  try {
    await withSecureStorage(() => savePreferences(preferences));
    suspendedAt = null;
    useSecurity.setState({
      ...preferences,
      available: true,
      status: isCurrentAuthentication(attempt) ? "unlocked" : "locked",
      error: null,
    });
  } catch {
    useSecurity.setState({ error: "storage" });
  } finally {
    useSecurity.setState({ busy: false });
  }
}

function suspendAccess() {
  const state = useSecurity.getState();
  if (!state.enabled) return;
  // A native authentication window is part of the current attempt. Keep its
  // generation alive, but never restore it through a background grace period.
  if (!authenticating) ++generation;
  if (
    state.status === "unlocked" &&
    !state.busy &&
    state.autoLockTimeoutMs > 0
  ) {
    suspendedAt = suspensionTime();
    useSecurity.setState({ status: "suspended", error: null });
  } else if (state.status !== "suspended" || state.busy) {
    suspendedAt = null;
    if (state.status !== "loading") useSecurity.setState({ status: "locked" });
  }
}

function restoreAccess() {
  const state = useSecurity.getState();
  if (state.status !== "suspended" || !isForeground()) return;
  const restore =
    suspendedAt !== null &&
    isWithinLockGrace(suspendedAt, suspensionTime(), state.autoLockTimeoutMs);
  suspendedAt = null;
  useSecurity.setState({
    status: restore ? "unlocked" : "locked",
    error: null,
  });
}

export const useSecurity = create<SecurityState>((set, get) => ({
  status: native ? "loading" : "unlocked",
  enabled: false,
  autoLockTimeoutMs: 0,
  available: false,
  busy: false,
  appState: AppState.currentState ?? "unknown",
  windowFocused: true,
  error: null,
  async initialize() {
    if (!native) {
      set({
        status: "unlocked",
        enabled: false,
        autoLockTimeoutMs: 0,
        available: false,
        error: null,
      });
      return;
    }
    if (initialization) return initialization;
    if (get().busy) return;
    ++generation;
    suspendedAt = null;
    set({
      status: "loading",
      appState: AppState.currentState ?? get().appState,
      error: null,
    });
    initialization = (async () => {
      try {
        const [stored, level] = await Promise.all([
          withSecureStorage(async () => {
            const value = await SecureStore.getItemAsync(securityPreferenceKey);
            const legacy =
              value === null
                ? await SecureStore.getItemAsync(legacySecurityPreferenceKey)
                : null;
            return { value, legacy };
          }),
          LocalAuthentication.getEnrolledLevelAsync(),
        ]);
        const available = level >= LocalAuthentication.SecurityLevel.SECRET;
        const preferences =
          stored.value === null
            ? migrateSecurityPreference(stored.legacy, available)
            : parseSecurityPreferences(stored.value);
        if (
          stored.value === null &&
          (stored.legacy !== null || preferences.enabled)
        )
          await withSecureStorage(() => savePreferences(preferences));
        set({
          ...preferences,
          available,
          status: preferences.enabled ? "locked" : "unlocked",
          error: null,
        });
      } catch {
        set({
          status: "locked",
          enabled: true,
          autoLockTimeoutMs: 0,
          error: "storage",
        });
      }
    })().finally(() => {
      initialization = null;
    });
    return initialization;
  },
  async unlock(prompt) {
    if (get().status !== "locked" || get().error === "storage") return;
    const attempt = await authenticate(prompt);
    if (attempt === null) return;
    suspendedAt = null;
    if (isCurrentAuthentication(attempt)) {
      set({ status: "unlocked", error: null, busy: false });
    } else {
      set({ status: "locked", error: "background", busy: false });
    }
  },
  async setEnabled(value, prompt) {
    if (
      !native ||
      get().status !== "unlocked" ||
      get().busy ||
      get().enabled === value
    )
      return;
    await changePreferences(
      { enabled: value, autoLockTimeoutMs: get().autoLockTimeoutMs },
      prompt,
    );
  },
  async setAutoLockTimeout(value, prompt) {
    if (
      !native ||
      !isAutoLockTimeout(value) ||
      get().status !== "unlocked" ||
      get().busy ||
      !get().enabled ||
      get().autoLockTimeoutMs === value
    )
      return;
    await changePreferences(
      { enabled: get().enabled, autoLockTimeoutMs: value },
      prompt,
    );
  },
  lock() {
    ++generation;
    suspendedAt = null;
    if (get().enabled) set({ status: "locked", error: null });
  },
  handleAppState(state) {
    set({ appState: state });
    if (state !== "active") suspendAccess();
    else restoreAccess();
  },
  handleWindowFocus(focused) {
    set({ windowFocused: focused });
    if (!focused) suspendAccess();
    else restoreAccess();
  },
}));

export function isAppAccessAllowed() {
  const state = useSecurity.getState();
  return (
    state.status === "unlocked" && (!native || !state.enabled || isForeground())
  );
}
export function assertAppAccess() {
  if (!isAppAccessAllowed())
    throw new Error("Unlock Bycoda to access your computer.");
}
