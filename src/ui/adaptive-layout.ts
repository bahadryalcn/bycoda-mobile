import { useWindowDimensions } from "react-native";
import { adaptiveLayout, type AdaptiveLayout } from "./adaptive-layout-model";
import { useFoldState } from "./fold-state";

export { splitListWidth, wideDock, type AdaptiveLayout } from "./adaptive-layout-model";

/**
 * Follows rotation, window resizing (iPad Split View, Android multi-window), foldable unfold/fold
 * and the foldable iPhone's inner/outer display. Nothing is cached: every input is a live hook.
 */
export function useAdaptiveLayout(): AdaptiveLayout {
  const { width, height } = useWindowDimensions();
  const fold = useFoldState();
  return adaptiveLayout(width, height, fold);
}
