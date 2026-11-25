import { createContext, use, type ReactNode } from "react";

/** `scopeControl` is the page's shared project scope; it joins the computer selector in one row. */
export type HeaderIdentityProps = { title: string; subtitle?: string; scopeControl?: ReactNode };

export const ScreenChrome = createContext<{
  nativeTitle: boolean;
  bottomSafeArea: boolean;
  /** Measured height of the floating dock overlaying the scene; 0 when no dock is shown. */
  bottomInset: number;
  headerAccessory?: ReactNode;
  headerIdentity?: (props: HeaderIdentityProps) => ReactNode;
  /** An app-wide command at the far right of a tab's title row (the voice assistant). */
  headerTrailing?: ReactNode;
}>({ nativeTitle: false, bottomSafeArea: true, bottomInset: 0 });

export function useScreenChrome() {
  return use(ScreenChrome);
}

/** Space a screen must keep clear at the bottom for the floating dock (absolute elements, last rows). */
export function useBottomInset() {
  return use(ScreenChrome).bottomInset;
}

/**
 * A route's shared project pill for the pages it hosts (a project tool route hosts its tool's
 * screens and their loading or recovery states). `ScreenHeading` shows it in the scope row of a
 * page that does not pass its own `scopeControl`, so the route owns which project is selectable.
 */
export const ScreenScopeControl = createContext<ReactNode>(undefined);

/**
 * The switchable computer pill (connection status, the saved computers and Manage computers),
 * provided once at the app root so `ScreenHeading` can show it without importing the connection
 * owner. Pages that read the active computer show it in their scope row; pages bound to one
 * computer (a route opened for that computer) show a read-only computer pill instead.
 */
export const ScreenComputerControl = createContext<(() => ReactNode) | undefined>(undefined);
