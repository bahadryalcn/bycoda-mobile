import { create } from "zustand";

export const DIAGNOSTIC_CONSENT_KEY = "bycoda.mobile.diagnostics-consent.v1";
export const DIAGNOSTIC_PERIODIC_KEY = "bycoda.mobile.diagnostics-periodic.v1";
export const DIAGNOSTIC_PERIODIC_RETRY_KEY = "bycoda.mobile.diagnostics-periodic-retry.v1";

export const DIAGNOSTIC_MODES = ["off", "ask", "auto"] as const;
export type DiagnosticMode = (typeof DIAGNOSTIC_MODES)[number];
/** `mode: null` means never decided; it behaves like `ask`. */
export interface DiagnosticConsent {
  mode: DiagnosticMode | null;
  decidedAt: string | null;
}

type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
};

export const effectiveMode = (mode: DiagnosticMode | null): DiagnosticMode => mode ?? "ask";

export function createDiagnosticPrefs(storage: Storage, now: () => Date = () => new Date()) {
  const readDate = async (key: string): Promise<Date | null> => {
    try {
      const raw = await storage.getItem(key);
      const date = raw ? new Date(raw) : null;
      return date && !Number.isNaN(date.getTime()) ? date : null;
    } catch {
      return null;
    }
  };
  return {
    async readConsent(): Promise<DiagnosticConsent> {
      try {
        const value: unknown = JSON.parse((await storage.getItem(DIAGNOSTIC_CONSENT_KEY)) ?? "null");
        const record = value as { mode?: unknown; decidedAt?: unknown } | null;
        if (record && DIAGNOSTIC_MODES.includes(record.mode as DiagnosticMode))
          return {
            mode: record.mode as DiagnosticMode,
            decidedAt: typeof record.decidedAt === "string" ? record.decidedAt : null,
          };
      } catch {
        // An unreadable value means "not decided", which asks before any upload.
      }
      return { mode: null, decidedAt: null };
    },
    async writeConsent(mode: DiagnosticMode): Promise<DiagnosticConsent> {
      const consent = { mode, decidedAt: now().toISOString() };
      await storage.setItem(DIAGNOSTIC_CONSENT_KEY, JSON.stringify(consent));
      return consent;
    },
    readLastPeriodic: () => readDate(DIAGNOSTIC_PERIODIC_KEY),
    writeLastPeriodic: (at: Date) => storage.setItem(DIAGNOSTIC_PERIODIC_KEY, at.toISOString()),
    /** Earliest time the automatic upload may try again after a result that did not send. */
    readPeriodicRetryAt: () => readDate(DIAGNOSTIC_PERIODIC_RETRY_KEY),
    writePeriodicRetryAt: (at: Date) => storage.setItem(DIAGNOSTIC_PERIODIC_RETRY_KEY, at.toISOString()),
  };
}

export function periodicDue(last: Date | null, now: Date, intervalDays: number): boolean {
  return !last || now.getTime() - last.getTime() >= intervalDays * 86_400_000;
}

export type DiagnosticPreferenceState = {
  consent: DiagnosticConsent;
  hydrated: boolean;
  hydrate(): Promise<void>;
  setMode(mode: DiagnosticMode): Promise<void>;
};

/** The app's consent state, separate from native diagnostic capture and transport. */
export function createDiagnosticPreferenceStore(prefs: Pick<ReturnType<typeof createDiagnosticPrefs>, "readConsent" | "writeConsent">) {
  let hydration: Promise<void> | undefined;
  let persistence: Promise<DiagnosticConsent | void> = Promise.resolve();
  let selectionVersion = 0;
  let confirmed: DiagnosticConsent = { mode: null, decidedAt: null };
  return create<DiagnosticPreferenceState>((set, get) => ({
    consent: confirmed,
    hydrated: false,
    hydrate() {
      if (get().hydrated) return Promise.resolve();
      if (hydration) return hydration;
      const version = selectionVersion;
      hydration = prefs.readConsent().then((consent) => {
        if (version !== selectionVersion || get().hydrated) return;
        confirmed = consent;
        set({ consent });
      }).finally(() => set({ hydrated: true }));
      return hydration;
    },
    async setMode(mode) {
      const version = ++selectionVersion;
      const write = () => prefs.writeConsent(mode);
      const result = persistence.then(write, write);
      persistence = result;
      try {
        confirmed = await result;
        if (version === selectionVersion) set({ consent: confirmed, hydrated: true });
      } catch (error) {
        if (version === selectionVersion) set({ consent: confirmed });
        throw error;
      }
    },
  }));
}
