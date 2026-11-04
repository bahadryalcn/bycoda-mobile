import { useCallback, useContext, useId, useLayoutEffect, useRef, useState } from "react";
import { confirmAction } from "./confirm";
import { useCopy } from "./copy";

import { SheetGuardContext, type SheetGuardState as Guard } from "./sheet-guard-context";
export { SheetGuardContext } from "./sheet-guard-context";

/** The Sheet owns approval; a continuation exists only for that specific request. */
export function useSheetDismissal({ visible, dirty, pending, onClose }: {
  visible: boolean; dirty: boolean; pending: boolean; onClose: () => void;
}) {
  type Intent = { afterClose?: () => void };
  const [confirmation, setConfirmation] = useState<Intent | null>(null);
  const active = useRef<Intent | null>(null);
  const mounted = useRef(true);
  const completed = useRef(false);
  const latest = useRef({ visible, dirty, pending, onClose });
  latest.current = { visible, dirty, pending, onClose };
  const cancelClose = useCallback(() => { active.current = null; setConfirmation(null); }, []);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; active.current = null; };
  }, []);
  useLayoutEffect(() => {
    if (!visible) { completed.current = false; cancelClose(); }
  }, [visible, cancelClose]);
  const startClose = useCallback((afterClose?: () => void) => {
    const state = latest.current;
    if (!mounted.current || completed.current || !state.visible || state.pending) return;
    if (state.dirty) {
      const intent = { afterClose };
      active.current = intent;
      setConfirmation(intent);
    } else {
      cancelClose();
      completed.current = true;
      state.onClose();
      afterClose?.();
    }
  }, [cancelClose]);
  const confirmClose = () => {
    const state = latest.current;
    if (!mounted.current || completed.current || !state.visible || state.pending || !confirmation || active.current !== confirmation) return;
    const afterClose = confirmation.afterClose;
    cancelClose();
    completed.current = true;
    state.onClose();
    afterClose?.();
  };
  return {
    confirming: visible && confirmation !== null,
    requestClose: useCallback(() => startClose(), [startClose]),
    requestCloseThen: useCallback((afterClose: () => void) => startClose(afterClose), [startClose]),
    cancelClose, confirmClose,
  };
}

export function useSheetGuards() {
  const [guards, setGuards] = useState<Record<string, Guard>>({});
  const register = useCallback((id: string, guard: Guard | null) => {
    setGuards((current) => {
      if (!guard) {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      }
      if (current[id]?.dirty === guard.dirty && current[id]?.pending === guard.pending)
        return current;
      return { ...current, [id]: guard };
    });
  }, []);
  return {
    register,
    dirty: Object.values(guards).some((guard) => guard.dirty),
    pending: Object.values(guards).some((guard) => guard.pending),
  };
}

/** Editors share the same dismissal path for Cancel, header close and Android Back. */
export function useSheetGuard({
  dirty = false,
  pending = false,
  onClose,
}: Guard & { onClose?: () => void }) {
  const context = useContext(SheetGuardContext);
  const register = context?.register;
  const id = useId();
  const copy = useCopy();
  const latest = useRef({ dirty, pending, onClose, context });
  latest.current = { dirty, pending, onClose, context };
  const mounted = useRef(true);
  const requestId = useRef(0);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; requestId.current++; };
  }, []);
  useLayoutEffect(() => {
    register?.(id, { dirty, pending });
    return () => register?.(id, null);
  }, [register, id, dirty, pending]);
  const startClose = (afterClose?: () => void) => {
    const state = latest.current;
    if (!mounted.current || state.pending) return;
    const currentRequest = ++requestId.current;
    if (state.context) {
      if (afterClose) state.context.requestCloseThen(afterClose);
      else state.context.requestClose();
      return;
    }
    if (!state.onClose) return;
    const finish = () => {
      const current = latest.current;
      if (!mounted.current || current.pending || currentRequest !== requestId.current || !current.onClose) return;
      requestId.current++;
      current.onClose();
      afterClose?.();
    };
    if (!state.dirty) {
      finish();
      return;
    }
    confirmAction(
      copy("Değişiklikler kaydedilmedi", "Unsaved changes"),
      copy("Kaydedilmemiş değişiklikleri silmek istiyor musun?", "Discard your unsaved changes?"),
      copy("Değişiklikleri sil", "Discard changes"),
      finish,
      copy("Düzenlemeye devam et", "Keep editing"),
    );
  };
  return { requestClose: () => startClose(), requestCloseThen: (afterClose: () => void) => startClose(afterClose) };
}
