import { createContext, use, type ReactNode } from "react";

export type HeaderIdentityProps = { title: string; subtitle?: string };

export const ScreenChrome = createContext<{
  nativeTitle: boolean;
  bottomSafeArea: boolean;
  /** Measured height of the floating dock overlaying the scene; 0 when no dock is shown. */
  bottomInset: number;
  headerAccessory?: ReactNode;
  headerIdentity?: (props: HeaderIdentityProps) => ReactNode;
}>({ nativeTitle: false, bottomSafeArea: true, bottomInset: 0 });

export function useScreenChrome() {
  return use(ScreenChrome);
}

/** Space a screen must keep clear at the bottom for the floating dock (absolute elements, last rows). */
export function useBottomInset() {
  return use(ScreenChrome).bottomInset;
}
