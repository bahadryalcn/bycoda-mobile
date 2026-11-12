import type { PropsWithChildren } from "react";
import Svg, { Circle, G } from "react-native-svg";
import { colors } from "../tokens";
import type { IllustrationName } from "./index";

/** Shared geometry and decoration semantics for the state art family. */
export function IllustrationFrame({ name, size, children }: PropsWithChildren<{ name: IllustrationName; size: number }>) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessible={false}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      aria-hidden={true} testID={`illustration-${name}`}>
      <Circle cx={60} cy={60} r={46} fill={colors.raised} />
      <G fill="none" stroke={colors.muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </G>
    </Svg>
  );
}

