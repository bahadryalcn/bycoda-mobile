import type { ReactNode } from "react";

/**
 * Latest content per overlay id. Content lives outside the provider's state so that
 * editing a sheet's children re-renders only that layer, not the whole overlay stack.
 */
export type OverlayContentStore = {
  set(id: string, children: ReactNode): void;
  get(id: string): ReactNode;
  subscribe(id: string, listener: () => void): () => void;
  delete(id: string): void;
};

type Slot = { children: ReactNode; listeners: Set<() => void> };

export function createOverlayContentStore(): OverlayContentStore {
  const slots = new Map<string, Slot>();
  const slotFor = (id: string) => {
    let slot = slots.get(id);
    if (!slot) {
      slot = { children: null, listeners: new Set() };
      slots.set(id, slot);
    }
    return slot;
  };
  return {
    set(id, children) {
      const slot = slotFor(id);
      if (slot.children === children) return;
      slot.children = children;
      for (const listener of slot.listeners) listener();
    },
    get: (id) => slots.get(id)?.children ?? null,
    subscribe(id, listener) {
      const slot = slotFor(id);
      slot.listeners.add(listener);
      return () => {
        slot.listeners.delete(listener);
      };
    },
    // Called only when the closing layer is removed; idempotent, so repeated updater runs are harmless.
    delete: (id) => {
      slots.delete(id);
    },
  };
}
