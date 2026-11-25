import { useMemo, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import { Stack as RouterStack, router } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { Screen, type PageScope } from "@/ui/primitives";
import { SheetGuardContext, useSheetGuards } from "@/ui/sheet-guard";
import { confirmAction } from "@/ui/confirm";
import { useCopy } from "@/ui/copy";
import { settingsRoutes } from "./settings-routes";

/**
 * One pushed Settings page: the native header title, the shared back button from the root stack
 * and one scrolling owner. Editors moved here from sheets keep calling `useSheetGuard`; this page
 * answers their `requestCloseThen` (leave for another screen) with the same unsaved-changes
 * confirmation a sheet would show, instead of silently doing nothing outside a sheet.
 */
export function SettingsPage({ title, scope, footer, children }: PropsWithChildren<{
  title: string; footer?: ReactNode;
  /** Which computer the page edits: the shared scope line, never a hand-built caption. */
  scope?: PageScope;
}>) {
  const copy = useCopy();
  const guards = useSheetGuards();
  const [removalConfirmed, setRemovalConfirmed] = useState(false);
  const latest = useRef(guards);
  latest.current = guards;
  const context = useMemo(() => {
    const leave = (afterClose?: () => void) => {
      const { dirty, pending } = latest.current;
      if (pending) return;
      const go = afterClose ?? (() => { if (router.canGoBack()) router.back(); else router.replace(settingsRoutes.root); });
      if (!dirty) { go(); return; }
      confirmAction(
        copy("Değişiklikler kaydedilmedi", "Unsaved changes"),
        copy("Kaydedilmemiş değişiklikleri silmek istiyor musun?", "Discard your unsaved changes?"),
        copy("Değişiklikleri sil", "Discard changes"),
        () => { if (!latest.current.pending) go(); },
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
      <RouterStack.Screen options={{ title, gestureEnabled: !guards.dirty && !guards.pending }} />
      <Screen title={title} scope={scope} footer={footer}>{children}</Screen>
    </SheetGuardContext>
  );
}
