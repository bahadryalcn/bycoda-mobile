import { useMobileTheme } from "./theme";
import { useImperativeHandle, useRef, useState } from "react";
import { View, type TextInput } from "react-native";
import Search from "lucide-react-native/icons/search";
import X from "lucide-react-native/icons/x";
import { Input } from "./fields";
import { IconButton } from "./buttons";
import { useCopy } from "./copy";
import { colors, radii, space } from "./tokens";
import type { InputProps } from "./component-props";
import { decorativeSvgProps } from "./accessibility";

/** A single search surface with a visible focus boundary and a spoken label. */
export function SearchField({
  label,
  placeholder = label,
  onFocus,
  onBlur,
  ref,
  style,
  clearable = true,
  clearLabel,
  ...props
}: InputProps & {
  clearable?: boolean;
  clearLabel?: string;
}) {
  useMobileTheme();
  const copy = useCopy();
  const input = useRef<TextInput>(null);
  useImperativeHandle(ref, () => input.current!, []);
  const [focused, setFocused] = useState(false);
  const canClear =
    clearable &&
    !!props.value &&
    !!props.onChangeText &&
    props.editable !== false &&
    !props.readOnly;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
        paddingStart: space.md,
        backgroundColor: colors.fill,
        borderWidth: 1.5,
        borderColor: focused ? colors.accent : "transparent",
        borderRadius: radii.pill,
        minHeight: 44,
      }}
    >
      <Search
        {...decorativeSvgProps}
        size={17}
        strokeWidth={2.2}
        color={colors.muted}
      />
      <Input
        {...props}
        ref={input}
        label={label}
        placeholder={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          { flex: 1, minWidth: 0, minHeight: 42, borderWidth: 0, backgroundColor: "transparent" },
          style,
        ]}
      />
      {canClear ? (
        <IconButton
          label={clearLabel ?? copy("Aramayı temizle", "Clear search")}
          onPress={() => {
            props.onChangeText?.("");
            input.current?.focus();
          }}
        >
          <X {...decorativeSvgProps} size={18} color={colors.muted} />
        </IconButton>
      ) : null}
    </View>
  );
}
