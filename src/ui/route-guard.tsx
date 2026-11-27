import { useMemo, useRef, useState, type PropsWithChildren } from "react";
import { Stack as RouterStack, router } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { SheetGuardContext, useSheetGuards } from "./sheet-guard";
import { confirmAction } from "./confirm";
import { useCopy } from "./copy";

/**
 * The dismissal owner of a pushed page whose editors were written for sheets: `useSheetGuard`
 * inside it answers Back, the swipe and `requestCloseThen` with the same unsaved-changes
 * confirmation a sheet shows, and a running write keeps the page open.
 */
export function RouteGuard({ fallback, children }: PropsWithChildren<{
  /** Where the page goes when it has no back history (a cold deep link). */
  fallback: () => void;
}>) {
  const copy = useCopy();
  const guards = useSheetGuards();
  const [removalConfirmed, setRemovalConfirmed] = useState(false);
  const latest = useRef({ guards, fallback });
  latest.current = { guards, fallback };
  const context = useMemo(() => {
    const leave = (afterClose?: () => void) => {
      const { dirty, pending } = latest.current.guards;
      if (pending) return;
      const go = afterClose ?? (() => { if (router.canGoBack()) router.back(); else latest.current.fallback(); });
      if (!dirty) { go(); return; }
      confirmAction(
        copy("Değişiklikler kaydedilmedi", "Unsaved changes"),
        copy("Kaydedilmemiş değişiklikleri silmek istiyor musun?", "Discard your unsaved changes?"),
        copy("Değişiklikleri sil", "Discard changes"),
        () => { if (!latest.current.guards.pending) go(); },
        copy("Düzenlemeye devam et", "Keep editing"),
      );
    };
    return { register: guards.register, requestClose: () => leave(), requestCloseThen: leave };
  }, [guards.register, copy]);
  usePreventRemove(!removalConfirmed && (guards.dirty || guards.pending), ({ repeat }) => {
    context.requestCloseThen(() => {
      setRemovalConfirmed(true);
      repeat();
    });
  });
  return (
    <SheetGuardContext value={context}>
      <RouterStack.Screen options={{ gestureEnabled: !guards.dirty && !guards.pending }} />
      {children}
    </SheetGuardContext>
  );
}
