import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import {
  decodeChatTextSize,
  encodeChatTextSize,
  normalizeChatTextSize,
} from "./chat-appearance-model";
import type { ChatTextSize } from "./chat-appearance-model";
export type { ChatTextSize } from "./chat-appearance-model";
export { CHAT_TEXT_SIZES } from "./chat-appearance-model";

export const CHAT_APPEARANCE_STORAGE_KEY = "bycoda.mobile.chat-appearance.v1";

export type ChatAppearanceState = {
  textSize: ChatTextSize;
  hydrated: boolean;
  storageError: Error | null;
  hydrate: () => Promise<void>;
  setTextSize: (textSize: ChatTextSize) => Promise<void>;
};

type PreferenceStorage = Pick<typeof AsyncStorage, "getItem" | "setItem">;

/** This preference stores presentation only, never messages or account state. */
export function createChatAppearanceStore(storage: PreferenceStorage) {
  let hydration: Promise<void> | undefined;
  let persistence = Promise.resolve();
  let selectionVersion = 0;
  return create<ChatAppearanceState>((set, get) => ({
    textSize: "compact",
    hydrated: false,
    storageError: null,
    hydrate: () => {
      if (get().hydrated) return Promise.resolve();
      if (hydration) return hydration;
      const version = selectionVersion;
      hydration = Promise.resolve()
        .then(() => storage.getItem(CHAT_APPEARANCE_STORAGE_KEY))
        .then((raw) => {
          if (version === selectionVersion)
            set({ textSize: decodeChatTextSize(raw), storageError: null });
        })
        .catch(() => {
          if (version === selectionVersion)
            set({ storageError: new Error("Chat appearance could not be loaded.") });
        })
        .finally(() => {
          set({ hydrated: true });
        });
      return hydration;
    },
    setTextSize: async (value) => {
      // A preference chosen during hydration wins over the older stored value.
      if (!get().hydrated) void get().hydrate();
      const version = ++selectionVersion;
      const textSize = normalizeChatTextSize(value);
      set({ textSize, storageError: null });
      const write = persistence
        .catch(() => undefined)
        .then(() => storage.setItem(CHAT_APPEARANCE_STORAGE_KEY, encodeChatTextSize(textSize)));
      persistence = write;
      try {
        await write;
        if (version === selectionVersion) set({ storageError: null });
      } catch {
        if (version === selectionVersion)
          set({ storageError: new Error("Chat appearance could not be saved.") });
      }
    },
  }));
}

export const chatAppearanceStore = createChatAppearanceStore(AsyncStorage);

/** Hydration starts once; selectors keep message renders scoped to text size. */
export function useChatAppearance<Selected>(
  selector: (state: ChatAppearanceState) => Selected,
): Selected {
  const value = chatAppearanceStore(selector);
  useEffect(() => {
    void chatAppearanceStore.getState().hydrate();
  }, []);
  return value;
}
