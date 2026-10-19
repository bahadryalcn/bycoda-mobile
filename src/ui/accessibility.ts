/** SVG renders directly to DOM on web, where React Native's accessible prop leaks. */
export const decorativeSvgProps =
  process.env.EXPO_OS === "web"
    ? { "aria-hidden": true as const, focusable: false }
    : { accessible: false };
