import { useMobileTheme } from "./theme";
import { useKeyboardSearch } from "@/features/keyboard/keyboard-search";
import { cloneElement, isValidElement, useRef, useState, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { SearchBar } from "panelui-native/components/search-bar";
import { useDebouncedValue } from "panelui-native/hooks/use-debounced-value";
import Search from "lucide-react-native/icons/search";
import { IconButton } from "./buttons";
import { useCopy } from "./copy";
import { iconSize, metrics, radii, space } from "./tokens";
import type { InputProps } from "./component-props";
import { decorativeSvgProps } from "./accessibility";
import { FormActions, Sheet } from "./dialogs";
import { FilterButton } from "./filter-sheet";

/**
 * A collection's search and its secondary actions. A `SearchField` becomes a search icon beside
 * the actions that opens the shared search sheet (see `useCollapsibleSearch`); no field row sits in
 * the page. `collapsible={false}` keeps a field that is the screen's primary task inline.
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
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: metrics.touchTarget }}>
      <View style={{ flex: 1, minWidth: 0 }}>{leading}</View>
      {search.trigger}
      {actions ? <View style={{ flexDirection: "row", flexShrink: 0 }}>{actions}</View> : null}
      {search.sheet}
    </View>
  );
}

export type CollectionFilterOptions = {
  /** Filter controls shown under the search field (status chips, toggles); they apply live. */
  filters?: ReactNode;
  /** Applied filters, shown as the dot on the filter icon. */
  activeFilters?: number;
  /** Resets every filter (not the search); offered with Reset while something is applied. */
  onResetFilters?: () => void;
  /**
   * One header control for search and filters (lists that have filters): the filter icon opens the
   * sheet with the search field on top, and its dot also counts an active search. Saves a header
   * slot so the title and scope pills can share the top row.
   */
  combined?: boolean;
  /** Spoken name of the filter icon (e.g. "Status"); defaults to "Filters". The sheet is titled Filters. */
  filtersLabel?: string;
};

/**
 * The one search and filter convention for collections. The page puts `trigger` (search icon,
 * accent while a query is active) and `filterTrigger` (sliders with a dot for applied filters,
 * only when the list has filters) in its heading actions; both open the same content-height
 * sheet with the search field on top and the filters below. Everything applies live, so the list
 * behind the sheet narrows as the person types; Reset clears search and filters, Done closes.
 * The search icon opens it with the keyboard focused on the field. No row exists for the icons.
 * `sheet` (also returned as `field` for older callers) renders nothing in the page's layout.
 */
export function useCollapsibleSearch(field: ReactElement<SearchFieldProps>, options: CollectionFilterOptions = {}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const [open, setOpen] = useState<"search" | "filters" | null>(null);
  const latest = useRef(field.props);
  latest.current = field.props;
  const query = (field.props.value ?? "").trim();
  const activeFilters = options.activeFilters ?? 0;
  const label = field.props.label ?? copy("Ara", "Search");
  const filtersLabel = options.filtersLabel ?? copy("Filtreler", "Filters");
  const reset = () => {
    if (latest.current.value) latest.current.onChangeText?.("");
    options.onResetFilters?.();
  };
  const sheet = open ? (
    <Sheet visible title={options.filters ? copy("Filtreler", "Filters") : label} size="compact" onClose={() => setOpen(null)}>
      {cloneElement(field, { autoFocus: open === "search", cancel: "never" })}
      {options.filters}
      <FormActions submitLabel={copy("Bitti", "Done")} onSubmit={() => setOpen(null)}
        {...(query || activeFilters ? { cancelLabel: copy("Sıfırla", "Reset"), onCancel: reset } : {})} />
    </Sheet>
  ) : null;
  const combined = !!options.combined && !!options.filters;
  return {
    open: !!open,
    trigger: combined ? null : (
      <IconButton label={label} expanded={open === "search"} onPress={() => setOpen("search")}>
        <Search {...decorativeSvgProps} size={iconSize.action} strokeWidth={2} color={query ? colors.accent : colors.muted} />
      </IconButton>
    ),
    filterTrigger: options.filters || activeFilters
      ? <FilterButton label={combined ? `${label} · ${filtersLabel}` : filtersLabel} count={activeFilters + (combined && query ? 1 : 0)} onPress={() => setOpen("filters")} />
      : null,
    sheet,
    field: sheet,
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
          { borderRadius: radii.pill, textAlignVertical: "center" },
          inactive && { color: colors.muted },
          fieldStyle,
        ])}
      />
    </View>
  );
}
