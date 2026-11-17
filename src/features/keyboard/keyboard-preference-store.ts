import { create } from "zustand";

export const KEYBOARD_STORAGE_KEY = "bycoda.mobile.keyboard.v1";
type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
export type KeyboardPreferences = {
  enterSends: boolean;
  hydrated: boolean;
  error: Error | null;
  hydrate(): Promise<void>;
  setEnterSends(value: boolean): Promise<void>;
};

export function createKeyboardPreferences(storage: Storage) {
  let hydration: Promise<void> | undefined;
  let writes = Promise.resolve();
  let revision = 0;
  return create<KeyboardPreferences>((set, get) => ({
    enterSends: true, hydrated: false, error: null,
    hydrate() {
      if (get().hydrated) return Promise.resolve();
      if (hydration) return hydration;
      const initial = revision;
      hydration = storage.getItem(KEYBOARD_STORAGE_KEY).then((raw) => {
        const stored: unknown = raw ? JSON.parse(raw) : null;
        if (revision === initial) set({ enterSends: stored !== null && typeof stored === "object" && "enterSends" in stored && typeof stored.enterSends === "boolean" ? stored.enterSends : true, error: null });
      }).catch(() => {
        if (revision === initial) set({ error: new Error("Keyboard preferences could not be loaded.") });
      }).finally(() => { set({ hydrated: true }); hydration = undefined; });
      return hydration;
    },
    async setEnterSends(value) {
      const current = ++revision;
      set({ enterSends: value, error: null });
      writes = writes.catch(() => undefined).then(() => storage.setItem(KEYBOARD_STORAGE_KEY, JSON.stringify({ enterSends: value })));
      try { await writes; if (revision === current) set({ error: null }); }
      catch { if (revision === current) set({ error: new Error("Keyboard preferences could not be saved.") }); }
    },
  }));
}
