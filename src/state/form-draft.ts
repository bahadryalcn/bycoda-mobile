import { useCallback, useState, type SetStateAction } from "react";

/** Form snapshots are JSON-shaped values; object key order is not an edit. */
export function sameFormValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = Object.keys(a);
  const right = Object.keys(b);
  return (
    left.length === right.length &&
    left.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(b, key) &&
        sameFormValue((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
}

/** A form owns one editable snapshot; server data stays in Query. */
export function useFormDraft<T extends object>(initial: T | (() => T)) {
  const [snapshot, setSnapshot] = useState(() => {
    const values = typeof initial === "function" ? (initial as () => T)() : initial;
    return { values, baseline: values };
  });
  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setSnapshot((current) =>
      Object.is(current.values[key], value)
        ? current
        : { ...current, values: { ...current.values, [key]: value } },
    );
  }, []);
  const patch = useCallback((update: Partial<T> | ((current: T) => Partial<T>)) => {
    setSnapshot((current) => ({
      ...current,
      values: {
        ...current.values,
        ...(typeof update === "function" ? update(current.values) : update),
      },
    }));
  }, []);
  const reset = useCallback((update: SetStateAction<T>) => {
    setSnapshot((current) => {
      const values =
        typeof update === "function" ? (update as (current: T) => T)(current.values) : update;
      return { values, baseline: values };
    });
  }, []);
  const markSaved = useCallback((submitted: T) => {
    setSnapshot((current) => ({ ...current, baseline: submitted }));
  }, []);
  return {
    values: snapshot.values,
    dirty: !sameFormValue(snapshot.values, snapshot.baseline),
    setField,
    patch,
    reset,
    markSaved,
  };
}
