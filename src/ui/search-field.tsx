import { useState } from "react";
import { View } from "react-native";
import Search from "lucide-react-native/icons/search";
import { Input } from "./fields";
import { colors, radii, space } from "./tokens";
import type { InputProps } from "./component-props";

/** A single search surface with a visible focus boundary and a spoken label. */
export function SearchField({ label, placeholder = label, onFocus, onBlur, ...props }: InputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        paddingStart: space.md,
        backgroundColor: colors.panel,
        borderWidth: 1,
        borderColor: focused ? colors.accent : colors.separator,
        borderRadius: radii.control,
      }}
    >
      <Search
        accessible={false}
        size={18}
        strokeWidth={1.7}
        color={focused ? colors.accent : colors.muted}
      />
      <Input
        {...props}
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
        style={{ flex: 1, minWidth: 0, borderWidth: 0, backgroundColor: "transparent" }}
      />
    </View>
  );
}
