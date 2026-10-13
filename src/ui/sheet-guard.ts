import { createContext, useCallback, useContext, useEffect, useId, useState } from "react";
import { confirmAction } from "./confirm";
import { useCopy } from "./copy";

type Guard = { dirty?: boolean; pending?: boolean };
export const SheetGuardContext = createContext<{
  register(id: string, guard: Guard | null): void;
  requestClose(): void;
} | null>(null);

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
  useEffect(() => {
    register?.(id, { dirty, pending });
    return () => register?.(id, null);
  }, [register, id, dirty, pending]);
  const requestClose = () => {
    if (context) {
      context.requestClose();
      return;
    }
    if (pending || !onClose) return;
    if (!dirty) {
      onClose();
      return;
    }
    confirmAction(
      copy("Değişiklikler kaydedilmedi", "Unsaved changes"),
      copy("Kaydedilmemiş değişiklikleri silmek istiyor musun?", "Discard your unsaved changes?"),
      copy("Değişiklikleri sil", "Discard changes"),
      onClose,
      copy("Düzenlemeye devam et", "Keep editing"),
    );
  };
  return { requestClose };
}
