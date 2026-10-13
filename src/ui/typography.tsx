import { Text as GlueText } from "./gluestack/text";
import { Heading as GlueHeading } from "./gluestack/heading";
import { uiStyles } from "./styles";
import { bodyClasses } from "./design-system";
import { StyleSheet } from "react-native";
import type { BodyProps, TextContentProps } from "./component-props";
export function Body({ children, muted, mono, style, ...props }: BodyProps) {
  return (
    <GlueText
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
    </GlueText>
  );
}
export function Heading({ children, style, ...props }: TextContentProps) {
  return (
    <GlueHeading
      selectable
      accessibilityRole="header"
      {...props}
      className="text-xl font-semibold text-foreground"
      style={StyleSheet.flatten([uiStyles.heading, style])}
    >
      {children}
    </GlueHeading>
  );
}
export function CodeText({ children, style, ...props }: TextContentProps) {
  return (
    <GlueText
      selectable
      {...props}
      className="font-mono text-sm text-foreground"
      style={StyleSheet.flatten([uiStyles.mono, style])}
    >
      {children}
    </GlueText>
  );
}
