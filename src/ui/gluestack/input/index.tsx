"use client";
import React from "react";
import { createInput } from "@gluestack-ui/core/input/creator";
import { View, Pressable, TextInput } from "react-native";
import { tva } from "@gluestack-ui/utils/nativewind-utils";
import { withStyleContext } from "@gluestack-ui/utils/nativewind-utils";
import { withUniwind } from "uniwind";
import type { VariantProps } from "@gluestack-ui/utils/nativewind-utils";
import { UIIcon } from "@gluestack-ui/core/icon/creator";

const SCOPE = "INPUT";

const StyledUIIcon = withUniwind(UIIcon);

const UIInput = createInput({
  Root: withStyleContext(View, SCOPE),
  Icon: StyledUIIcon,
  Slot: Pressable,
  Input: TextInput,
});

const inputStyle = tva({
  base: "min-h-control w-full flex-row items-center rounded-control border border-border dark:bg-input/30 bg-transparent overflow-hidden data-[focus=true]:border-ring data-[invalid=true]:border-destructive data-[disabled=true]:opacity-45 px-ui-md gap-ui-sm",
});

const inputIconStyle = tva({
  base: "justify-center items-center text-muted-foreground fill-none h-4 w-4",
});

const inputSlotStyle = tva({
  base: "justify-center items-center web:disabled:cursor-not-allowed",
});

const inputFieldStyle = tva({
  base: "flex-1 text-foreground text-sm md:text-sm py-ui-sm h-full placeholder:text-muted-foreground  web:outline-none  web:cursor-text web:data-[disabled=true]:cursor-not-allowed",
});

type IInputProps = React.ComponentProps<typeof UIInput> &
  VariantProps<typeof inputStyle> & { className?: string };
const Input = React.forwardRef<React.ComponentRef<typeof UIInput>, IInputProps>(function Input(
  { className, ...props },
  ref,
) {
  return <UIInput ref={ref} {...props} className={inputStyle({ class: className })} context={{}} />;
});

type IInputIconProps = React.ComponentProps<typeof UIInput.Icon> &
  VariantProps<typeof inputIconStyle> & {
    className?: string;
    height?: number;
    width?: number;
  };

const InputIcon = React.forwardRef<React.ComponentRef<typeof UIInput.Icon>, IInputIconProps>(
  function InputIcon({ className, ...props }, ref) {
    return <UIInput.Icon ref={ref} {...props} className={inputIconStyle({ class: className })} />;
  },
);

type IInputSlotProps = React.ComponentProps<typeof UIInput.Slot> &
  VariantProps<typeof inputSlotStyle> & { className?: string };

const InputSlot = React.forwardRef<React.ComponentRef<typeof UIInput.Slot>, IInputSlotProps>(
  function InputSlot({ className, ...props }, ref) {
    return (
      <UIInput.Slot
        ref={ref}
        {...props}
        className={inputSlotStyle({
          class: className,
        })}
      />
    );
  },
);

const NativeInputField = UIInput.Input as unknown as React.ForwardRefExoticComponent<
  React.ComponentPropsWithoutRef<typeof TextInput> & React.RefAttributes<TextInput>
>;
type IInputFieldProps = React.ComponentPropsWithoutRef<typeof TextInput> &
  VariantProps<typeof inputFieldStyle> & { className?: string };

const InputField = React.forwardRef<TextInput, IInputFieldProps>(function InputField(
  { className, ...props },
  ref,
) {
  return (
    <NativeInputField
      ref={ref}
      {...props}
      aria-label={props["aria-label"] ?? props.accessibilityLabel}
      className={inputFieldStyle({
        class: className,
      })}
    />
  );
});

Input.displayName = "Input";
InputIcon.displayName = "InputIcon";
InputSlot.displayName = "InputSlot";
InputField.displayName = "InputField";

export { Input, InputField, InputIcon, InputSlot };
