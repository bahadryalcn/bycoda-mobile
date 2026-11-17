import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create, useStore } from "zustand";
import {
  decodeChatDisplay,
  DEFAULT_CHAT_DISPLAY,
  encodeChatDisplay,
  normalizeChatDisplay,
  type ChatDisplay,
} from "./chat-display-model";

export const CHAT_DISPLAY_STORAGE_KEY = "bycoda.mobile.chat-display.v1";

export type ChatDisplayState = ChatDisplay & {
  hydrated: boolean;
  /** "read" or "save" failed; the choice still applies for this run. */
  storageError: "read" | "save" | null;
  hydrate: () => Promise<void>;
  update: (patch: Partial<ChatDisplay>) => Promise<void>;
};
type Storage = Pick<typeof AsyncStorage, "getItem" | "setItem">;

/** Presentation only; never messages or account state. */
export function createChatDisplayStore(storage: Storage) {
  let hydration: Promise<void> | undefined;
  let persistence = Promise.resolve();
  let touched = false;
  return create<ChatDisplayState>((set, get) => ({
    ...DEFAULT_CHAT_DISPLAY,
    hydrated: false,
    storageError: null,
    hydrate: () => {
      if (get().hydrated) return Promise.resolve();
      hydration ??= Promise.resolve()
        .then(() => storage.getItem(CHAT_DISPLAY_STORAGE_KEY))
        .then((raw) => {
          // A choice made while reading wins over the older stored value.
          if (!touched) set({ ...decodeChatDisplay(raw), storageError: null });
        })
        .catch(() => set({ storageError: "read" }))
        .finally(() => {
          hydration = undefined;
          set({ hydrated: true });
        });
      return hydration;
    },
    update: async (patch) => {
      touched = true;
      const next = normalizeChatDisplay({ ...get(), ...patch });
      set({ ...next, storageError: null });
      const write = persistence.catch(() => undefined).then(() => storage.setItem(CHAT_DISPLAY_STORAGE_KEY, encodeChatDisplay(next)));
      persistence = write;
      try {
        await write;
      } catch {
        set({ storageError: "save" });
      }
    },
  }));
}

export const chatDisplayStore = createChatDisplayStore(AsyncStorage);

/** Hydration starts once; selectors keep renders scoped to the setting they read. */
export function useChatDisplay<Selected>(selector: (state: ChatDisplayState) => Selected): Selected {
  const value = useStore(chatDisplayStore, selector);
  // Effect reason: load the saved preferences once for the first consumer.
  useEffect(() => {
    void chatDisplayStore.getState().hydrate();
  }, []);
  return value;
}
