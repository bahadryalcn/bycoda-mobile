import { Body } from "./typography";
import { fontSize, lineHeight } from "./tokens";
import type { BodyProps } from "./component-props";

/**
 * One headline figure (28/34, tabular digits). Use it instead of overriding `fontSize` on `Body`,
 * which keeps the 21 pt body line height and clips the top of large digits.
 */
export function MetricValue({ children, style, ...props }: BodyProps) {
  return (
    <Body
      {...props}
      style={[{ fontSize: fontSize.display, lineHeight: lineHeight.display, fontWeight: "600", fontVariant: ["tabular-nums"] }, style]}
    >
      {children}
    </Body>
  );
}
