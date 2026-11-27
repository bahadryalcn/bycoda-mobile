import { useState } from "react";

/**
 * The one press feedback of a list row (NavigationRow, PressableCard, SelectField options, ToggleField):
 * rows never scale or fade, they fill with the theme's `pressedFill` while pressed. Spread
 * `rowPressMotion` on an AnimatedPressable and its `handlers`, then paint `pressedFill` when `pressed`.
 */
export const rowPressMotion = { pressScale: 1, pressOpacity: 1 } as const;

export function useRowPress() {
  const [pressed, setPressed] = useState(false);
  return {
    pressed,
    handlers: { onPressIn: () => setPressed(true), onPressOut: () => setPressed(false) },
  };
}
