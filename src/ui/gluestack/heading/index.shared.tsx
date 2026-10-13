import React from "react";
import { Text, type TextProps } from "react-native";
import type { VariantProps } from "@gluestack-ui/utils/nativewind-utils";
import { headingStyle } from "./styles";
type Props = TextProps & VariantProps<typeof headingStyle>;
export const Heading = React.forwardRef<Text, Props>(function Heading(
  {
    size = "xl",
    className,
    isTruncated,
    bold,
    underline,
    strikeThrough,
    sub,
    italic,
    highlight,
    ...props
  },
  ref,
) {
  return (
    <Text
      {...props}
      ref={ref}
      accessibilityRole="header"
      className={headingStyle({
        size,
        isTruncated,
        bold,
        underline,
        strikeThrough,
        sub,
        italic,
        highlight,
        class: className,
      })}
    />
  );
});
