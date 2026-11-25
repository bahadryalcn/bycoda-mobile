import type { ComponentProps } from "react";
import { useWindowDimensions } from "react-native";
import { ChoiceChip } from "@/ui/primitives";
import { metrics, space } from "@/ui/tokens";

/**
 * The shared chip has a fixed height; at larger text sizes its label would be clipped, so the
 * chip grows with its content instead (never below the standard chip height).
 */
export function SessionFilterChip({ style, ...props }: ComponentProps<typeof ChoiceChip>) {
  const { fontScale } = useWindowDimensions();
  return <ChoiceChip {...props} style={[fontScale > 1 ? { height: "auto", minHeight: metrics.chipHeight, paddingVertical: space.xs } : null, style]} />;
}
