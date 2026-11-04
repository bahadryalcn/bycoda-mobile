import { createContext, Fragment, useContext, useId, useLayoutEffect, useState, useSyncExternalStore, type PropsWithChildren, type ReactNode } from "react";

/** Presentation slots only; the original queue/editor controller keeps its state and callbacks. */
export function createComposerActionsStore() {
  let snapshot: readonly (readonly [string, ReactNode])[] = [];
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    set(id: string, content: ReactNode) {
      const index = snapshot.findIndex(([key]) => key === id);
      if (index >= 0 && snapshot[index][1] === content) return;
      snapshot = index < 0 ? [...snapshot, [id, content] as const] : snapshot.map((entry, i) => i === index ? [id, content] as const : entry);
      emit();
    },
    remove(id: string) { const next = snapshot.filter(([key]) => key !== id); if (next.length !== snapshot.length) { snapshot = next; emit(); } },
  };
}
const Context = createContext<ReturnType<typeof createComposerActionsStore> | null>(null);
export function ComposerActionsProvider({children}:PropsWithChildren) {
  const [store] = useState(createComposerActionsStore);
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useComposerActionArea() { return !!useContext(Context); }
export function ComposerActionSlot({children}:PropsWithChildren) {
  const store = useContext(Context), id = useId();
  useLayoutEffect(() => { store?.set(id, children); }, [store, id, children]);
  useLayoutEffect(() => () => { store?.remove(id); }, [store, id]);
  return store ? null : <>{children}</>;
}
function RegisteredActions({store}:{store:ReturnType<typeof createComposerActionsStore>}) {
  const entries = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return <>{entries.map(([id,node]) => <Fragment key={id}>{node}</Fragment>)}</>;
}
export function ComposerActionArea() {
  const store = useContext(Context);
  return store ? <RegisteredActions store={store}/> : null;
}
