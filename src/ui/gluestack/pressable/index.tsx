"use client";
import React from "react";
import { createPressable } from "@gluestack-ui/core/pressable/creator";
import { Pressable as RNPressable, type PressableProps, type View } from "react-native";

import { tva } from "@gluestack-ui/utils/nativewind-utils";
import { withStyleContext } from "@gluestack-ui/utils/nativewind-utils";
import type { VariantProps } from "@gluestack-ui/utils/nativewind-utils";

const UIPressable = createPressable({
  Root: withStyleContext(RNPressable),
});

const pressableStyle = tva({
  base: "data-[focus-visible=true]:outline-none data-[focus-visible=true]:ring-ring data-[focus-visible=true]:ring-2 data-[disabled=true]:opacity-40",
});

// Core's inferred ref describes props; the actual host ref is a native View.
const NativePressable = UIPressable as unknown as React.ForwardRefExoticComponent<
  PressableProps & React.RefAttributes<View>
>;
type IPressableProps = PressableProps & VariantProps<typeof pressableStyle>;
const Pressable = React.forwardRef<View, IPressableProps>(function Pressable(
  { className, ...props },
  ref,
) {
  return (
    <NativePressable
      {...props}
      ref={ref}
      className={pressableStyle({
        class: className,
      })}
    />
  );
});

Pressable.displayName = "Pressable";
export { Pressable };
