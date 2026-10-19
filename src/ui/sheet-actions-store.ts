import type { FormActionsProps } from "./component-props";

/** A Sheet-local content slot. It never owns drafts or executes callbacks. */
export function createSheetActionsStore() {
  let snapshot: readonly (readonly [string, FormActionsProps])[] = [];
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getSnapshot: () => snapshot,
    set(id: string, actions: FormActionsProps) {
      const index = snapshot.findIndex(([key]) => key === id);
      if (index >= 0 && snapshot[index][1] === actions) return;
      snapshot = index < 0
        ? [...snapshot, [id, actions] as const]
        : snapshot.map((entry, i) => i === index ? [id, actions] as const : entry);
      emit();
    },
    remove(id: string) {
      const next = snapshot.filter(([key]) => key !== id);
      if (next.length === snapshot.length) return;
      snapshot = next;
      emit();
    },
  };
}
