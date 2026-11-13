import { expect, it, vi } from "vitest";
import { createDiagnosticPreferenceStore, type DiagnosticConsent, type DiagnosticMode } from "./diagnostic-prefs";
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
const consent = (mode: DiagnosticMode | null): DiagnosticConsent => ({ mode, decidedAt: mode ? "2026-11-13T00:00:00Z" : null });
it("a delayed stored value cannot replace a newer saved consent selection", async () => {
  const read = deferred<DiagnosticConsent>(); const store = createDiagnosticPreferenceStore({ readConsent: () => read.promise, writeConsent: async (mode) => consent(mode) });
  const hydration = store.getState().hydrate(); await store.getState().setMode("off"); read.resolve(consent("auto")); await hydration;
  expect(store.getState().consent.mode).toBe("off"); expect(store.getState().hydrated).toBe(true);
});
it("deduplicates concurrent hydration and retains undecided default until read completes", async () => {
  const read = deferred<DiagnosticConsent>(); const readConsent = vi.fn(() => read.promise); const store = createDiagnosticPreferenceStore({ readConsent, writeConsent: async (mode) => consent(mode) });
  const first = store.getState().hydrate(), second = store.getState().hydrate(); expect(store.getState().consent.mode).toBeNull();
  expect(readConsent).toHaveBeenCalledOnce(); read.resolve(consent("ask")); await Promise.all([first, second]); expect(store.getState().consent.mode).toBe("ask");
});
it("serializes rapid selections so latest successful choice is final in memory and storage", async () => {
  const write = deferred<DiagnosticConsent>(); let stored: DiagnosticMode | null = null;
  const writeConsent = vi.fn(async (mode: DiagnosticMode) => { if (mode === "auto") { const value = await write.promise; stored = value.mode; return value; } stored = mode; return consent(mode); });
  const store = createDiagnosticPreferenceStore({ readConsent: async () => consent("ask"), writeConsent }); await store.getState().hydrate();
  const first = store.getState().setMode("auto"), second = store.getState().setMode("off"); await Promise.resolve();
  expect(writeConsent).toHaveBeenCalledTimes(1); write.resolve(consent("auto")); await Promise.all([first, second]);
  expect(stored).toBe("off"); expect(store.getState().consent.mode).toBe("off");
});
it("failed writes never authorize automatic sharing and remain retryable", async () => {
  const writeConsent = vi.fn(async (_mode: DiagnosticMode): Promise<DiagnosticConsent> => { throw new Error("Storage unavailable"); });
  const store = createDiagnosticPreferenceStore({ readConsent: async () => consent("ask"), writeConsent }); await store.getState().hydrate();
  await expect(store.getState().setMode("auto")).rejects.toThrow("Storage unavailable"); expect(store.getState().consent.mode).toBe("ask");
  writeConsent.mockImplementationOnce(async (mode) => consent(mode)); await store.getState().setMode("off"); expect(store.getState().consent.mode).toBe("off");
});
