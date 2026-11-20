import { createContext, use } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScreenChrome } from "./screen-chrome";
import { space } from "./tokens";

/**
 * True below a non-scrolling `Screen` frame (and false again inside a Sheet): the frame already pads the
 * dock and home-indicator inset, so a list or scroller in it must not reserve that space a second time.
 */
export const ScreenFrameInsets = createContext(false);

/**
 * Insets a scroller or full-height region adds to its own content. Horizontal gutters are always the
 * caller's: a notch or cutout in landscape wins over the flat `space.screen` gutter. The bottom is zero
 * when the surrounding non-scrolling `Screen` frame already reserved the dock and home indicator.
 * Use this instead of reading `useSafeAreaInsets` in a page-level list, ScrollView or heading.
 */
export function useScreenContentInsets() {
  const insets = useSafeAreaInsets();
  const chrome = useScreenChrome();
  const frameOwnsBottom = use(ScreenFrameInsets);
  return {
    left: Math.max(insets.left, space.screen),
    right: Math.max(insets.right, space.screen),
    bottom: frameOwnsBottom ? 0 : chrome.bottomInset + (chrome.bottomSafeArea ? insets.bottom : 0),
  };
}
