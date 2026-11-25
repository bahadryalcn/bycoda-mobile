import { scrollKeyboardDismissMode } from "./scroll-keyboard";
import { useMobileTheme } from "./theme";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ChevronsUpDown from "lucide-react-native/icons/chevrons-up-down";
import { FlatList, StyleSheet, View, useWindowDimensions, type HostInstance } from "react-native";
import { AnimatedPressable } from "panelui-native/primitives/animated-pressable";
import Check from "lucide-react-native/icons/check";
import { Sheet } from "./dialogs";
import { Body } from "./typography";
import { Button } from "./buttons";
import { SearchField } from "./search-field";
import { Empty, FieldError, Loading } from "./feedback";
import { useLocale } from "@/i18n";
import { usePrivateContentAccess, type PrivateContentAccess } from "./private-access";
import { normalizeSearch } from "./search-matching";
import { useFilteredListScrollMemory } from "./use-list-scroll-memory";
import { useCopy } from "./copy";
import { useReducedMotionPreference } from "./use-reduced-motion";
import { InfoHint, UnitHint, isUnitHint } from "./info-hint";
import { useInNavigationGroup } from "./navigation-row";
import { GroupHeading, SubgroupHeading } from "./group-heading";
import { metrics, opacity, radii, space, gapIcon } from "./tokens";
import { filterSelection, selectionLabels, toggleSelection, type SelectionOption } from "./selection-model";

const SEARCH_THRESHOLD = 6;
const NO_OPTIONS: readonly never[] = [];

type SelectionFieldOption<T extends string> = SelectionOption<T> & {
  icon?: ReactNode;
  /** Mark shown in the group heading (e.g. the provider); also the closed field's mark when `icon` is absent. */
  groupIcon?: ReactNode;
};

type CommonProps<T extends string> = {
  label: string;
  options: readonly SelectionFieldOption<T>[];
  disabled?: boolean;
  placeholder?: string;
  hideLabel?: boolean;
  compact?: boolean;
  searchable?: boolean;
  summaryLimit?: number;
  hint?: string;
  error?: string;
  /** "row" renders an iOS settings row (label, value, chevrons) for use inside NavigationGroup. */
  variant?: "field" | "row";
  icon?: ReactNode;
};
type SelectProps<T extends string> = CommonProps<T> & { value?: T; onChange: (value: T) => void };
type MultiSelectProps<T extends string> = CommonProps<T> & {
  values: readonly T[];
  onChange: (values: T[]) => void;
  max?: number;
};

type AutocompleteBehavior<T extends string> = {
  freeValue?: (text: string) => T;
  loading?: boolean;
  /** When supplied, the caller filters and publishes results for the latest query. */
  onQueryChange?: (query: string) => void;
};
export type AutocompleteFieldProps = Omit<SelectProps<string>, "searchable"> &
  Omit<AutocompleteBehavior<string>, "freeValue"> & { allowFreeText?: boolean };

export function AutocompleteField({ allowFreeText, loading, onQueryChange, ...props }: AutocompleteFieldProps) {
  return (
    <SelectionField
      {...props}
      searchable
      values={props.value === undefined ? [] : [props.value]}
      onChange={([value]) => props.onChange(value!)}
      autocomplete={{ freeValue: allowFreeText ? (text) => text : undefined, loading, onQueryChange }}
    />
  );
}

export function SelectField<T extends string>(props: SelectProps<T>) {
  useMobileTheme();
  return (
    <SelectionField
      {...props}
      values={props.value === undefined ? [] : [props.value]}
      onChange={(values) => props.onChange(values[0]!)}
    />
  );
}
export function MultiSelectField<T extends string>(props: MultiSelectProps<T>) {
  useMobileTheme();
  return <SelectionField {...props} multiple />;
}

function SelectionField<T extends string>({
  label,
  options,
  values,
  onChange,
  disabled,
  placeholder,
  multiple,
  max,
  hideLabel,
  compact,
  searchable,
  summaryLimit = 2,
  hint,
  error,
  variant = "field",
  icon,
  autocomplete,
}: MultiSelectProps<T> & { multiple?: boolean; autocomplete?: AutocompleteBehavior<T> }) {
  const { colors, semanticColors, uiStyles } = useMobileTheme();
  const stackSummary = useWindowDimensions().fontScale > 1 && !hideLabel;
  const copy = useCopy();
  const reducedMotion = useReducedMotionPreference();
  const locale = useLocale(), access = usePrivateContentAccess();
  const trigger = useRef<HostInstance>(null);
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [opening, setOpening] = useState<{ access: PrivateContentAccess; selected: ReadonlySet<T> } | null>(null);
  const open = !!opening;
  const [search, setSearch] = useState("");
  const optionLabels = useMemo(
    () => new Map(options.map((option) => [
      option.value, option.summaryLabel ?? (option.group ? `${option.group} · ${option.label}` : option.label),
    ])),
    [options],
  );
  const labels = selectionLabels(values, optionLabels);
  const selectedOption = values.length === 1
    ? options.find((option) => option.value === values[0])
    : undefined;
  const selectedIcon = selectedOption?.icon ?? selectedOption?.groupIcon;
  const limit = Math.max(1, summaryLimit);
  const summary = labels.length
    ? `${labels.slice(0, limit).join(", ")}${labels.length > limit ? ` +${labels.length - limit}` : ""}`
    : (placeholder ?? copy("Seç…", "Select…"));
  const searchEnabled = (searchable ?? options.length > SEARCH_THRESHOLD) || !!search;
  const remote = !!autocomplete?.onQueryChange;
  const loading = !!autocomplete?.loading;
  const searchKey = normalizeSearch(search, locale);
  const customValue = autocomplete?.freeValue?.(search.trim());
  const freeEntry = !!customValue && !options.some(option => option.value === customValue || option.label === customValue)
    ? customValue
    : "";
  const filtered = useMemo(() => {
    if (!opening || loading) return NO_OPTIONS;
    const matches = remote || !searchKey ? options : filterSelection(options, search, locale);
    if (searchKey || matches.length <= SEARCH_THRESHOLD || !opening.selected.size || matches.some(option => option.group)) {
      return matches;
    }
    // Keep the initial selection near the top without moving rows as a multi-picker is edited.
    return [
      ...matches.filter(option => opening.selected.has(option.value)),
      ...matches.filter(option => !opening.selected.has(option.value)),
    ];
  }, [opening, loading, remote, searchKey, options, search, locale]);
  const available = !disabled && access.allowed && access.check() && (!opening || opening.access.allowed && opening.access.check());
  // Only an open panel needs option identity to retire stale events; a closed trigger must not serialise every option on each render.
  const signature = open ? JSON.stringify([remote ? search : searchKey, locale, values, options.map(option => [option.value, option.label, option.detail, option.disabled, option.group, option.subgroup, option.searchKeywords])]) : "";
  const view = useMemo(() => ({}), [opening, available, signature, multiple, max, loading, freeEntry]);
  const input = useMemo(() => ({}), [opening, available]);
  const live = useRef({ opening, view, input, available, access, values, onChange, filtered });
  live.current = { opening, view, input, available, access, values, onChange, filtered };
  const current = () => mounted.current && !!opening && live.current.opening === opening && live.current.available &&
    live.current.access.allowed && live.current.access.check() && opening.access.allowed && opening.access.check();
  const close = () => { if (mounted.current && opening && live.current.opening === opening) { live.current.opening = null; setOpening(null); } };
  const activateTrigger = () => {
    if (!mounted.current || live.current.opening !== opening || !live.current.available || !live.current.access.allowed || !live.current.access.check()) return;
    if (opening) return;
    const next = { access: live.current.access, selected: new Set(live.current.values) };
    live.current.opening = next;
    setSearch("");
    setOpening(next);
    autocomplete?.onQueryChange?.("");
  };
  useLayoutEffect(() => { if (opening && !available) close(); }, [opening, available]);
  const changeSearch = (value: string) => {
    if (!current() || live.current.input !== input) return;
    setSearch(value);
    autocomplete?.onQueryChange?.(value);
  };
  const clearSearch = () => { if (live.current.view === view) changeSearch(""); };
  const clearSelection = () => { if (current() && live.current.view === view) live.current.onChange([]); };
  const choose = (value: T) => {
    if (!current() || live.current.view !== view) return;
    const item = live.current.filtered.find(option => option.value === value);
    if (!item || item.disabled || multiple && !live.current.values.includes(value) && max !== undefined && live.current.values.length >= max) return;
    live.current.onChange(multiple ? toggleSelection(live.current.values, value, max) : [value]);
    if (!multiple) close();
  };
  const chooseFreeEntry = () => {
    if (!current() || live.current.view !== view || !freeEntry || loading) return;
    close();
    live.current.onChange([freeEntry]);
  };
  const position = useFilteredListScrollMemory<SelectionFieldOption<T>>(searchKey, open && available, filtered.length, { suspended: !open || !available });
  const row = variant === "row";
  const grouped = useInNavigationGroup();
  const controls = searchEnabled || multiple ? (
    <View style={[uiStyles.header, { paddingHorizontal: space.screen, paddingBottom: space.xs, flexShrink: 0 }]}>
      {searchEnabled ? <SearchField
        label={copy("Seçenek ara", "Search options")}
        autoCapitalize="none"
        value={search} onChangeText={changeSearch} /> : null}
      {multiple ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.row, minHeight: 34 }}>
          <Body muted style={[uiStyles.grow, uiStyles.caption]}>
            {max !== undefined
              ? copy("{p0}/{p1} seçildi", "{p0}/{p1} selected", { p0: values.length, p1: max })
              : copy("{p0} seçildi", "{p0} selected", { p0: values.length })}
          </Body>
          {values.length ? (
            <Button density="compact" disabled={!available}
              label={copy("Seçimi temizle", "Clear selection")} onPress={clearSelection} />
          ) : null}
        </View>
      ) : null}
    </View>
  ) : null;
  const empty = loading
    ? <Loading label={copy("Seçenekler yükleniyor", "Loading options")} immediate />
    : freeEntry ? undefined : (
      <Empty compact
        title={searchKey ? copy("Eşleşen seçenek yok.", "No matching options.") : copy("Kullanılabilir seçenek yok.", "No options available.")}
        action={searchKey ? { label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch } : undefined}
      />
    );
  const renderOption = (item: SelectionFieldOption<T>) => {
    const selected = values.includes(item.value);
    const off = !available || !!item.disabled ||
      (!!multiple && !selected && max !== undefined && values.length >= max);
    return (
      // Select/Combobox items require their own root and expose menuitem semantics.
      // Keep the guarded Sheet, virtualized rows and checkbox/radio contract here.
      <AnimatedPressable
        pressScale={1}
        pressOpacity={reducedMotion ? 1 : opacity.pressed}
        accessibilityRole={multiple ? "checkbox" : "radio"}
        accessibilityLabel={[item.subgroup, item.label, item.group, item.detail].filter(Boolean).join(". ")}
        accessibilityState={{ checked: selected, disabled: off }}
        aria-checked={selected}
        aria-disabled={off}
        disabled={off}
        onPress={() => choose(item.value)}
        style={{
          minHeight: metrics.touchTarget,
          flexDirection: "row",
          alignItems: "center",
          gap: space.md,
          paddingHorizontal: space.md,
          // Effort variants sit under their model's name.
          ...(item.subgroup ? { paddingLeft: space.md + space.lg } : {}),
          paddingVertical: space.sm,
          borderRadius: radii.control,
          backgroundColor: selected ? colors.fill : "transparent",
          ...(off ? { opacity: opacity.disabled } : {}),
        }}
      >
        <SelectionIcon>{item.icon}</SelectionIcon>
        <View style={[uiStyles.grow, { gap: 2 }]}>
          {/* The fill and the mark carry the selection; the label keeps its reading colour. */}
          <Body>{item.label}</Body>
          {item.detail ? <Body muted style={uiStyles.caption}>{item.detail}</Body> : null}
        </View>
        {multiple ? (
          <View accessible={false} style={{
            width: 20, height: 20, borderRadius: radii.badge, alignItems: "center", justifyContent: "center",
            ...(selected ? { backgroundColor: colors.accent } : { borderWidth: 1.5, borderColor: colors.muted }),
          }}>
            {selected ? <Check color={colors.primaryText} strokeWidth={3} size={14} /> : null}
          </View>
        ) : selected ? (
          <Check color={colors.accent} strokeWidth={2.6} size={20} />
        ) : null}
      </AnimatedPressable>
    );
  };
  const groupHeading = (item: SelectionFieldOption<T>, index: number) => {
    const previous = filtered[index - 1];
    const newGroup = !!item.group && item.group !== previous?.group;
    const newSubgroup = !!item.subgroup && (newGroup || item.subgroup !== previous?.subgroup);
    if (!newGroup && !newSubgroup) return null;
    return (
      <View style={{ paddingHorizontal: space.md }}>
        {newGroup ? <GroupHeading title={item.group!} icon={item.groupIcon} /> : null}
        {newSubgroup ? <SubgroupHeading title={item.subgroup!} /> : null}
      </View>
    );
  };
  const showHint = !row && !hideLabel && !!hint && !isUnitHint(hint);
  return (
    <View style={row ? undefined : [uiStyles.field, (error || isUnitHint(hint)) && { paddingBottom: space.xs }]}>
      <View style={showHint ? { flexDirection: "row", alignItems: "center", gap: space.xs } : undefined}>
        <AnimatedPressable
          pressScale={1}
          pressOpacity={reducedMotion ? 1 : opacity.pressed}
          ref={trigger}
          accessibilityRole="combobox"
          accessibilityLabel={`${label}: ${labels.length ? labels.join(", ") : summary}`}
          accessibilityHint={error ?? hint}
          accessibilityState={{ expanded: open && available, disabled: !available }}
          aria-expanded={open && available}
          aria-disabled={!available}
          disabled={!available}
          onPress={activateTrigger}
          style={[
            !row && uiStyles.input,
            row && {
              paddingHorizontal: grouped ? space.sm : 0,
              marginHorizontal: grouped ? -space.sm : 0,
              paddingVertical: space.row,
            },
            compact && !row && { paddingVertical: space.xxs },
            !row && (open || error) && {
              borderColor: error ? semanticColors.danger.border : colors.accent,
            },
            !available && { opacity: opacity.disabled },
            showHint && uiStyles.grow,
            {
              minHeight: row || !compact ? metrics.rowHeightProject : metrics.touchTarget,
              flexDirection: "row",
              alignItems: "center",
              gap: gapIcon,
              minWidth: 0,
            },
          ]}
        >
          <SelectionIcon>{icon}</SelectionIcon>
          <View style={[uiStyles.grow, stackSummary
            ? { alignItems: "flex-start", gap: space.xxs }
            : { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.xs }]}>
            {!hideLabel ? (
              <Body selectable={false} style={[uiStyles.label, !stackSummary && { flexGrow: 1, flexShrink: 1, flexBasis: 104 }]}>
                {label}
              </Body>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexShrink: 1, maxWidth: "100%", flexGrow: hideLabel ? 1 : 0 }}>
              <SelectionIcon>{selectedIcon}</SelectionIcon>
              <Body selectable={false} muted={!hideLabel || !labels.length} style={{ flexShrink: 1 }}>{summary}</Body>
            </View>
          </View>
          <ChevronsUpDown size={16} strokeWidth={2} color={colors.tertiary} />
        </AnimatedPressable>
        {showHint ? <InfoHint text={hint} /> : null}
      </View>
      {row && grouped ? <View accessible={false} style={uiStyles.separator} /> : null}
      {error ? <FieldError message={error} /> : <UnitHint hint={hint} />}
      <Sheet
        visible={open && available}
        onClose={close}
        title={label}
        size={searchEnabled ? "form" : "compact"}
        scroll={false}
        returnFocusRef={trigger}
        headerAction={multiple ? (
          <Button label={copy("Tamam", "Done")} tone="quiet" onPress={close} reserveTouchTarget />
        ) : undefined}
      >
        <View style={{ flexShrink: 1, flexGrow: searchEnabled ? 1 : 0, minHeight: 0 }}>
          {controls}
          <FlatList
            {...position.listProps}
            data={filtered}
            extraData={values}
            style={{ flexGrow: searchEnabled ? 1 : 0, flexShrink: 1 }}
            removeClippedSubviews={false}
            keyExtractor={(option) => option.value}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={searchEnabled ? "none" : scrollKeyboardDismissMode("on-drag")}
            automaticallyAdjustKeyboardInsets={false}
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={{
              paddingHorizontal: space.screen,
              paddingBottom: space.lg,
              width: "100%",
              maxWidth: metrics.contentWidth,
              alignSelf: "center",
            }}
            ItemSeparatorComponent={() => (
              <View style={[uiStyles.separator, { marginHorizontal: space.sm }]} />
            )}
            ListHeaderComponent={freeEntry && !loading ? (
              <Button
                tone="quiet"
                label={copy("“{p0}” kullan", "Use “{p0}”", { p0: freeEntry })}
                onPress={chooseFreeEntry}
                reserveTouchTarget
              />
            ) : undefined}
            ListEmptyComponent={empty}
            renderItem={({ item, index }) => <>{groupHeading(item, index)}{renderOption(item)}</>}
          />
        </View>
      </Sheet>
    </View>
  );
}

function SelectionIcon({ children }: { children?: ReactNode }) {
  if (children == null || children === false) return null;
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ flexShrink: 0, alignItems: "center", justifyContent: "center" }}>
    {typeof children === "string" || typeof children === "number" ? <Body>{children}</Body> : children}
  </View>;
}
