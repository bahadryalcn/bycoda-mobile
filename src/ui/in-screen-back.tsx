import { useEffect } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useNavigation } from "expo-router/react-navigation";
import { EDGE_BACK_WIDTH, shouldCompleteEdgeBack } from "./in-screen-back-model";

/**
 * Back for a sub-view that lives inside a route (file diff, history, folder level) rather
 * than on the native stack. While `active`, the native swipe-back is disabled, so it can
 * never reveal the previous route and then snap to an in-screen state. The same left-edge
 * swipe is handled here instead and calls `onBack`, the handler the header back button uses.
 * Render inside the screen's relatively positioned root. Android hardware back stays with
 * `useBackHandler` in the owner.
 */
export function InScreenBack({ active, onBack }: { active: boolean; onBack: () => void }) {
  const navigation = useNavigation();
  useEffect(() => {
    // Reason: the native interactive pop must be off exactly while an in-screen sub-view owns back.
    if (!active) return;
    navigation.setOptions({ gestureEnabled: false });
    return () => navigation.setOptions({ gestureEnabled: true });
  }, [active, navigation]);
  if (!active) return null;
  const swipe = Gesture.Pan().runOnJS(true).activeOffsetX(12).failOffsetY([-16, 16])
    .onEnd((event) => { if (shouldCompleteEdgeBack(event)) onBack(); });
  return (
    <GestureDetector gesture={swipe}>
      <View accessible={false} importantForAccessibility="no" style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: EDGE_BACK_WIDTH }} />
    </GestureDetector>
  );
}
