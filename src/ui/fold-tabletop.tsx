import type { ReactNode } from "react";
import { View } from "react-native";
import { useAdaptiveLayout } from "./adaptive-layout";

/**
 * Tabletop posture: content above the hinge, controls below it. Without a tabletop fold it is a
 * plain column (content, then controls), so callers can use it unconditionally.
 */
export function TabletopView({ content, controls }: { content: ReactNode; controls: ReactNode }) {
  const { tabletop } = useAdaptiveLayout();
  if (!tabletop) {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, minHeight: 0 }}>{content}</View>
        {controls}
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <View style={{ height: tabletop.start, minHeight: 0 }}>{content}</View>
      <View style={{ height: tabletop.size }} />
      <View style={{ flex: 1, minHeight: 0 }}>{controls}</View>
    </View>
  );
}
