import { useMobileTheme } from "./theme";
import { useKeyboardSearch } from "@/features/keyboard/keyboard-search";
import { cloneElement, isValidElement, useState, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { SearchBar } from "panelui-native/components/search-bar";
import { useDebouncedValue } from "panelui-native/hooks/use-debounced-value";
import Search from "lucide-react-native/icons/search";
import { IconButton } from "./buttons";
import { useCopy } from "./copy";
import { iconSize, metrics, space } from "./tokens";
import type { InputProps } from "./component-props";
import { decorativeSvgProps } from "./accessibility";

/**
 * A collection's search and its secondary actions in one compact row. A `SearchField` collapses
 * to a search icon beside the actions until the person opens it (or a query is active); the open
 * field takes the row with a Cancel that clears and folds it again. `collapsible={false}` keeps a
 * field that is the screen's primary task always open. `leading` is quiet context (an applied
 * filter summary) shown at the start of the collapsed row.
 */
export function SearchToolbar({ search, actions, leading, collapsible = true }: {
  search: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
  collapsible?: boolean;
}) {
  const field = collapsible && isValidElement<SearchFieldProps>(search) && search.type === SearchField && search.props.onChangeText
    ? search as ReactElement<SearchFieldProps> : undefined;
  if (!field) return <CollectionToolbar field={search} actions={actions} />;
  return <CollapsibleSearchToolbar field={field} actions={actions} leading={leading} />;
}

function CollapsibleSearchToolbar({ field, actions, leading }: {
  field: ReactElement<SearchFieldProps>;
  actions?: ReactNode;
  leading?: ReactNode;
}) {
  const search = useCollapsibleSearch(field);
  if (search.field) return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
      <View style={{ flex: 1, minWidth: 0 }}>{search.field}</View>
      {actions ? <View style={{ flexDirection: "row", flexShrink: 0 }}>{actions}</View> : null}
    </View>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: metrics.touchTarget }}>
      <View style={{ flex: 1, minWidth: 0 }}>{leading}</View>
      {search.trigger}
      {actions ? <View style={{ flexDirection: "row", flexShrink: 0 }}>{actions}</View> : null}
    </View>
  );
}

/**
 * The collapsible search behind `SearchToolbar`, for a page whose search is its only collection
 * control: `trigger` (the search icon, null while open) joins the page heading's trailing actions
 * and `field` (the open field with Clear and Cancel, null while closed) takes its own row below,
 * so no row exists just to hold one icon. An active query keeps the field open.
 */
export function useCollapsibleSearch(field: ReactElement<SearchFieldProps>) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const query = field.props.value ?? "";
  // `opened` remembers an explicit open so clearing the query (or a "Clear search" recovery that
  // refocuses the field) keeps it open; an active query always shows the field.
  const [opened, setOpened] = useState(!!query);
  const [focusOnOpen, setFocusOnOpen] = useState(false);
  if (query && !opened) setOpened(true);
  const open = opened || !!query;
  return {
    open,
    trigger: open ? null : (
      <IconButton label={field.props.label ?? copy("Ara", "Search")} expanded={false} onPress={() => { setFocusOnOpen(true); setOpened(true); }}>
        <Search {...decorativeSvgProps} size={iconSize.action - 2} strokeWidth={2} color={colors.muted} />
      </IconButton>
    ),
    // A row of its own, so the field fills the width without growing a column parent.
    field: open ? <View style={{ flexDirection: "row", alignItems: "center", minWidth: 0 }}>{cloneElement(field, {
      style: [field.props.style, { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }],
      autoFocus: focusOnOpen || field.props.autoFocus,
      cancel: "always",
      cancelLabel: copy("Vazgeç", "Cancel"),
      onCancel: () => {
        field.props.onChangeText?.("");
        setOpened(false);
        setFocusOnOpen(false);
        field.props.onCancel?.();
      },
    })}</View> : null,
  };
}

/** A collection's primary search or scope field keeps room beside wrapping actions. */
export function CollectionToolbar({ field, actions }: { field: ReactNode; actions: ReactNode }) {
  useMobileTheme();
  const { fontScale } = useWindowDimensions();
  return <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }}>
    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 148 * Math.max(1, fontScale), minWidth: 0 }}>{field}</View>
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
  /** When the PanelUI Cancel button shows beside the field (`SearchToolbar` sets it while open). */
  cancel?: "never" | "focus" | "always";
  cancelLabel?: string;
  /** After Cancel empties the field and drops focus. */
  onCancel?: () => void;
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
