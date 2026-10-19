import { useMobileTheme } from "./theme";
import { Typography } from "panelui-native/components/typography";
import { uiStyles } from "./styles";
import { bodyClasses } from "./design-system";
import { StyleSheet } from "react-native";
import type { BodyProps, TextContentProps } from "./component-props";
export function Body({ children, muted, mono, style, ...props }: BodyProps) {
  useMobileTheme();
  return (
    <Typography
      selectable
      {...props}
      className={bodyClasses}
      style={StyleSheet.flatten([
        uiStyles.body,
        mono && uiStyles.mono,
        muted && uiStyles.mutedTone,
        style,
      ])}
    >
      {children}
    </Typography>
  );
}
export function Heading({ children, style, ...props }: TextContentProps) {
  useMobileTheme();
  return (
    <Typography.Heading
      selectable
      accessibilityRole="header"
      {...props}
      className="text-xl font-semibold text-foreground"
      style={StyleSheet.flatten([uiStyles.heading, style])}
    >
      {children}
    </Typography.Heading>
  );
}
export function CodeText({ children, style, ...props }: TextContentProps) {
  useMobileTheme();
  return (
    <Typography
      selectable
      {...props}
      className="font-mono text-sm text-foreground"
      style={StyleSheet.flatten([uiStyles.mono, style])}
    >
      {children}
    </Typography>
  );
}
