import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DraftStore, flushLatestDraft } from "./draft-store";

type DraftState<T> = {
  status: "loading" | "load-error" | "ready";
  value: T | null;
  saved: T | null;
  error: unknown;
};
type DraftAction<T> =
  | { type: "loading" }
  | { type: "loaded"; value: T | null }
  | { type: "load-error" | "save-error"; error: unknown }
  | { type: "edit"; value: T | null }
  | { type: "saved"; value: T | null };
function reducer<T>(state: DraftState<T>, action: DraftAction<T>): DraftState<T> {
  switch (action.type) {
    case "loading":
      return { ...state, status: "loading", error: null };
    case "loaded":
      return { status: "ready", value: action.value, saved: action.value, error: null };
    case "load-error":
      return { ...state, status: "load-error", error: action.error };
    case "save-error":
      return { ...state, error: action.error };
    case "edit":
      return { ...state, value: action.value };
    case "saved":
      return { ...state, saved: action.value, error: null };
  }
}

/** Storage reads, debounce, and unmount flush are external effects, scoped by the mounted draft key. */
export function useLocalDraft<T>(
  key: string,
  decode: (raw: string) => T,
  encode: (value: T | null) => string | null,
) {
  const [state, dispatch] = useReducer(reducer<T>, {
    status: "loading",
    value: null,
    saved: null,
    error: null,
  });
  const store = useMemo(
    () => new DraftStore<T>(AsyncStorage, key, decode, encode),
    [key, decode, encode],
  );
  const valueRef = useRef<T | null>(null);
  const setValue = useCallback((update: T | null | ((current: T | null) => T | null)) => {
    const value =
      typeof update === "function"
        ? (update as (current: T | null) => T | null)(valueRef.current)
        : update;
    valueRef.current = value;
    dispatch({ type: "edit", value });
  }, []);
  const persist = useCallback(
    async (value?: T | null) => {
      try {
        if (value === undefined)
          await flushLatestDraft(
            store,
            () => valueRef.current,
            (saved) => dispatch({ type: "saved", value: saved }),
          );
        else {
          await store.persist(value);
          dispatch({ type: "saved", value });
        }
      } catch (error) {
        dispatch({ type: "save-error", error });
        throw error;
      }
    },
    [store],
  );
  const load = useCallback(async () => {
    dispatch({ type: "loading" });
    try {
      const value = await store.load();
      valueRef.current = value;
      dispatch({ type: "loaded", value });
    } catch (error) {
      dispatch({ type: "load-error", error });
    }
  }, [store]);
  useEffect(() => {
    void load();
    return () => {
      if (store.ready) void persist(valueRef.current).catch(() => {});
    };
  }, [store, load, persist]);
  useEffect(() => {
    if (state.status !== "ready" || state.error) return;
    const timer = setTimeout(() => {
      void persist(state.value).catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [state.status, state.value, state.error, persist]);
  return {
    value: state.value,
    valueRef,
    setValue,
    ready: state.status === "ready",
    error: state.error,
    isStored: encode(state.value) === encode(state.saved) && !state.error,
    load,
    persist,
  };
}
