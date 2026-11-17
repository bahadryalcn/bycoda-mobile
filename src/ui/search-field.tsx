import { useMobileTheme } from "./theme";
import { useKeyboardSearch } from "@/features/keyboard/keyboard-search";
import type { ComponentProps, ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { SearchBar } from "panelui-native/components/search-bar";
import { useDebouncedValue } from "panelui-native/hooks/use-debounced-value";
import Search from "lucide-react-native/icons/search";
import { useCopy } from "./copy";
import { space } from "./tokens";
import type { InputProps } from "./component-props";
import { decorativeSvgProps } from "./accessibility";

/** Search keeps useful room; secondary actions wrap together instead of squeezing it. */
export function SearchToolbar({ search, actions }: { search: ReactNode; actions: ReactNode }) {
  return <CollectionToolbar field={search} actions={actions} />;
}

/** A collection's primary search or scope field keeps room beside wrapping actions. */
export function CollectionToolbar({ field, actions }: { field: ReactNode; actions: ReactNode }) {
  useMobileTheme();
  const { fontScale } = useWindowDimensions();
  return <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 180 * Math.max(1, fontScale), minWidth: 0 }}>{field}</View>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginStart: "auto", minWidth: 0, flexShrink: 1, maxWidth: "100%" }}>{actions}</View>
  </View>;
}

/** Debounce a search query for expensive filtering; the input itself stays immediate. */
export function useDebouncedSearch(query: string, delay = 300): string {
  return useDebouncedValue(query, delay);
}

type SearchFieldProps = InputProps & {
  clearable?: boolean;
  clearLabel?: string;
  /** Pause in ms before `onDebouncedChange` runs; unset keeps behavior immediate. */
  debounce?: number;
  onDebouncedChange?: (value: string) => void;
};

/** A single search surface with a visible focus boundary and a spoken label. */
export function SearchField({
  label,
  placeholder = label,
  style,
  clearable = true,
  clearLabel,
  ref,
  editable,
  readOnly,
  value,
  onChangeText,
  tone: _tone,
  mono: _mono,
  hint,
  error,
  ...props
}: SearchFieldProps) {
  const { colors, uiStyles } = useMobileTheme();
  const copy = useCopy();
  // Layout belongs to the outer wrapper so toolbars can size the field; the
  // TextInput keeps only presentation.
  const { flex, flexGrow, flexShrink, flexBasis, alignSelf, width, minWidth, maxWidth, ...fieldStyle } =
    StyleSheet.flatten(style) ?? {};
  const inactive = editable === false || !!readOnly;
  const keyboardSearch = useKeyboardSearch(!inactive);
  const { accessibilityHint, ...rest } = props;
  return (
    <View style={{ minWidth: minWidth ?? 0, maxWidth: maxWidth ?? "100%", flex, flexGrow, flexShrink, flexBasis, alignSelf: alignSelf ?? "stretch", width }}>
      <SearchBar
        {...(rest as ComponentProps<typeof SearchBar>)}
        ref={(input) => {
          keyboardSearch.current = input;
          if (typeof ref === "function") ref(input);
          else if (ref) ref.current = input;
        }}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint ?? accessibilityHint}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        readOnly={readOnly}
        disabled={editable === false}
        isClearable={clearable && !!onChangeText && !inactive}
        clearLabel={clearLabel ?? copy("Aramayı temizle", "Clear search")}
        shape="pill"
        size="sm"
        icon={<Search {...decorativeSvgProps} size={16} strokeWidth={2.2} color={colors.muted} />}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        className="h-auto text-foreground bg-fill border-border"
        style={StyleSheet.flatten([
          uiStyles.input,
          { borderRadius: 999, textAlignVertical: "center" },
          inactive && { color: colors.muted },
          fieldStyle,
        ])}
      />
    </View>
  );
}
