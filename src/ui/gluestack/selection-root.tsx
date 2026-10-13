import React from "react";
import { Platform, Pressable, View, type PressableProps } from "react-native";
type Props = PressableProps & {
  checked?: boolean;
  states?: {
    checked?: boolean;
    disabled?: boolean;
    active?: boolean;
    readonly?: boolean;
    hover?: boolean;
  };
};
/** Core supplies selection through input props; translate it to native and web accessibility. */
export const SelectionRoot = React.forwardRef<View, Props>(function SelectionRoot(
  { checked, states, disabled, accessibilityState, style, children, ...props },
  ref,
) {
  const selected = checked ?? states?.checked ?? false;
  const off = disabled ?? states?.disabled ?? false;
  const ariaChecked: boolean | "mixed" =
    Reflect.get(props, "aria-checked") === "mixed" ? "mixed" : selected;
  const shared = {
    ...props,
    ref,
    "aria-checked": ariaChecked,
    "aria-disabled": off,
    accessibilityState: { ...accessibilityState, checked: ariaChecked, disabled: off },
  };
  const change = Reflect.get(props, "onChange");
  if (Platform.OS === "web" && typeof change === "function") {
    const activate = (event: { stopPropagation(): void }) => {
      if (!off && !states?.readonly)
        change({ target: { checked: !selected }, stopPropagation: () => event.stopPropagation() });
    };
    const web = {
      ...shared,
      onClick: activate,
      onKeyDown: (event: { key: string; preventDefault(): void; stopPropagation(): void }) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          activate(event);
        } else {
          const onKeyDown = Reflect.get(props, "onKeyDown");
          if (typeof onKeyDown === "function") onKeyDown(event);
        }
      },
    };
    const pressState = { pressed: !!states?.active, hovered: !!states?.hover };
    return (
      <View {...web} style={typeof style === "function" ? style(pressState) : style}>
        {typeof children === "function" ? children(pressState) : children}
      </View>
    );
  }
  return (
    <Pressable {...shared} disabled={off} style={style}>
      {children}
    </Pressable>
  );
});
