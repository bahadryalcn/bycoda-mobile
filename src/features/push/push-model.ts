import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

/** Hosts that accept Expo push registration advertise this capability. */
export const PUSH_CAPABILITY = "push.expo.v1";
export const PUSH_PREFERENCES_KEY = "bycoda.mobile.push.v1";

export type PushEventKind = "finished" | "input" | "failed";
/** Every moment a computer may notify: session events plus Assistant updates and owner approvals. */
export type PushPreferenceKind = PushEventKind | "assistant" | "approvals";
export type PushPreferences = {
  enabled: boolean;
  events: Record<PushPreferenceKind, boolean>;
  /** Urgent Assistant updates may ring during quiet hours. */
  assistantUrgentDuringQuiet: boolean;
};

const DEFAULTS: PushPreferences = {
  enabled: true,
  events: { finished: true, input: true, failed: true, assistant: true, approvals: true },
  assistantUrgentDuringQuiet: true,
};

export function decodePushPreferences(raw: string | null): PushPreferences {
  if (raw === null) return DEFAULTS;
  try {
    const value = JSON.parse(raw) as Partial<PushPreferences> | null;
    const events = (value?.events ?? {}) as Partial<Record<PushPreferenceKind, unknown>>;
    return {
      enabled: value?.enabled !== false,
      events: {
        finished: events.finished !== false,
        input: events.input !== false,
        failed: events.failed !== false,
        assistant: events.assistant !== false,
        approvals: events.approvals !== false,
      },
      assistantUrgentDuringQuiet: value?.assistantUrgentDuringQuiet !== false,
    };
  } catch {
    return DEFAULTS;
  }
}

type PushPreferencesState = PushPreferences & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  update: (patch: Partial<PushPreferences>) => void;
};

export const usePushPreferences = create<PushPreferencesState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,
  hydrate: async () => {
    if (get().hydrated) return;
    let raw: string | null = null;
    try {
      raw = await AsyncStorage.getItem(PUSH_PREFERENCES_KEY);
    } catch {
      // Unreadable storage keeps the defaults.
    }
    // A change made before hydration finished wins over the stored value.
    if (!get().hydrated) set({ ...decodePushPreferences(raw), hydrated: true });
  },
  update: (patch) => {
    const next = {
      enabled: get().enabled,
      events: get().events,
      assistantUrgentDuringQuiet: get().assistantUrgentDuringQuiet,
      ...patch,
    };
    set({ ...next, hydrated: true });
    void AsyncStorage.setItem(PUSH_PREFERENCES_KEY, JSON.stringify(next)).catch(() => {
      // The choice stays in memory for this session; the next change retries.
    });
  },
}));

/** Why the active computer can or cannot push to this phone. */
export type PushStatus =
  | { state: "checking" }
  | { state: "registered" }
  | { state: "off" }
  | { state: "permission" }
  | { state: "unsupported" }
  | { state: "unconfigured" }
  | { state: "error"; error: unknown };

export const usePushStatus = create<{ status: PushStatus; set: (status: PushStatus) => void }>(
  (set) => ({ status: { state: "checking" }, set: (status) => set({ status }) }),
);

export type PushTarget =
  | { kind: "session"; environmentId: string; sessionId: string; projectId?: string }
  | { kind: "approval"; environmentId: string; approvalId: string }
  | { kind: "assistant"; environmentId: string; jobId?: string; questions: boolean };

const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);

/**
 * Where a tapped push opens, on the computer the push came from. Callers navigate
 * (not push) so a tap on the conversation already on screen, or a repeat tap, reuses
 * its entry instead of stacking another copy.
 */
export function pushRoute(target: PushTarget, machineId: string) {
  if (target.kind === "approval")
    return { pathname: "/approvals" as const, params: { focus: target.approvalId } };
  if (target.kind === "assistant")
    return {
      pathname: "/assistant" as const,
      params: { ...(target.jobId ? { job: target.jobId } : {}), ...(target.questions ? { questions: "1" } : {}) },
    };
  return {
    pathname: "/session/[id]" as const,
    params: {
      id: target.sessionId,
      machineId,
      ...(target.projectId ? { projectId: target.projectId } : {}),
    },
  };
}

/**
 * What a tapped push that matches no paired computer says. Unreadable saved
 * computers are not evidence the computer is unpaired, so they get their own text.
 */
export function unmatchedPushNotice(storageError: string | null, copy: (tr: string, en: string) => string) {
  return storageError
    ? copy("Kayıtlı bilgisayarlar yüklenemedi; bu bildirim açılamadı.", "Saved computers could not be loaded, so this notification could not be opened.")
    : copy("Bu bildirim artık eşleşmiş bir bilgisayardan geliyor.", "This notification is from a computer that is no longer paired.");
}

/** Reads where a tapped push points; tests and unknown kinds open nothing. */
export function pushTarget(data: unknown): PushTarget | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  const environmentId = text(value.environmentId);
  if (!environmentId) return null;
  if (value.kind === "approval") {
    const approvalId = text(value.approvalId);
    return approvalId ? { kind: "approval", environmentId, approvalId } : null;
  }
  if (value.kind === "assistant") {
    const jobId = text(value.jobId);
    return {
      kind: "assistant",
      environmentId,
      questions: value.assistantKind === "owner.question",
      ...(jobId ? { jobId } : {}),
    };
  }
  if (!["finished", "input", "failed"].includes(String(value.kind))) return null;
  const sessionId = text(value.sessionId);
  if (!sessionId) return null;
  const projectId = text(value.projectId);
  return { kind: "session", environmentId, sessionId, ...(projectId ? { projectId } : {}) };
}
