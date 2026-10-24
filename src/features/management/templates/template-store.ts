import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { normalizeTemplates, type PromptTemplate } from "./template-model";

export const TEMPLATE_KEY = "bycoda.mobile.prompt-templates.v1";
type Storage = Pick<typeof AsyncStorage, "getItem" | "setItem">;
type TemplateState = { rows: PromptTemplate[]; hydrated: boolean; error: unknown; saving: boolean;
  hydrate(): Promise<void>; save(rows: PromptTemplate[], expected: PromptTemplate[]): Promise<void> };

/** Phone-local snippets. Desktop preferences remain owned by the desktop app. */
export function createTemplateStore(storage: Storage) {
  let hydration: Promise<void> | undefined;
  return create<TemplateState>((set, get) => ({
    rows: [], hydrated: false, error: null, saving: false,
    hydrate: () => {
      if (hydration) return hydration;
      if (get().saving) return Promise.resolve();
      set({ hydrated: false });
      hydration = (async () => {
        try {
          const raw = await storage.getItem(TEMPLATE_KEY);
          const value: unknown = raw ? JSON.parse(raw) : [];
          if (!Array.isArray(value)) throw new Error("Invalid saved templates");
          const rows = normalizeTemplates(value);
          set({ rows, hydrated: true, error: null });
        } catch (error) { set({ error }); }
        finally { hydration = undefined; }
      })();
      return hydration;
    },
    save: async (rows, expected) => {
      if (!get().hydrated || get().saving || get().error) throw new Error("Reload templates before saving");
      if (JSON.stringify(get().rows) !== JSON.stringify(expected)) throw new Error("Templates changed. Reopen before saving.");
      const clean = normalizeTemplates(rows);
      set({ saving: true });
      try {
        await storage.setItem(TEMPLATE_KEY, JSON.stringify(clean));
        set({ rows: clean, error: null });
      } catch (error) { set({ error, hydrated: false }); throw error; }
      finally { set({ saving: false }); }
    },
  }));
}
export const useTemplates = createTemplateStore(AsyncStorage);
export function useTemplateHydration() {
  useEffect(() => { if (!useTemplates.getState().hydrated) void useTemplates.getState().hydrate(); }, []);
}
