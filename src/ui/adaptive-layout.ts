import { useWindowDimensions } from "react-native";
import { adaptiveLayout, type AdaptiveLayout } from "./adaptive-layout-model";

export { SPLIT_LIST_WIDTH, type AdaptiveLayout } from "./adaptive-layout-model";

/** Follows rotation and window resizing (iPad Split View, Android multi-window). */
export function useAdaptiveLayout(): AdaptiveLayout {
  const { width, height } = useWindowDimensions();
  return adaptiveLayout(width, height);
}
