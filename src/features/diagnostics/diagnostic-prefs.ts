export const DIAGNOSTIC_CONSENT_KEY = "bycoda.mobile.diagnostics-consent.v1";
export const DIAGNOSTIC_PERIODIC_KEY = "bycoda.mobile.diagnostics-periodic.v1";

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
    async readLastPeriodic(): Promise<Date | null> {
      try {
        const raw = await storage.getItem(DIAGNOSTIC_PERIODIC_KEY);
        const date = raw ? new Date(raw) : null;
        return date && !Number.isNaN(date.getTime()) ? date : null;
      } catch {
        return null;
      }
    },
    writeLastPeriodic: (at: Date) => storage.setItem(DIAGNOSTIC_PERIODIC_KEY, at.toISOString()),
  };
}

export function periodicDue(last: Date | null, now: Date, intervalDays: number): boolean {
  return !last || now.getTime() - last.getTime() >= intervalDays * 86_400_000;
}
