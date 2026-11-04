import { scrollKeyboardDismissMode } from "./scroll-keyboard";
import { useMobileTheme } from "./theme";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ChevronsUpDown from "lucide-react-native/icons/chevrons-up-down";
import { FlatList, Text, View } from "react-native";
import { Pressable } from "react-native";
import Check from "lucide-react-native/icons/check";
import { DisclosureChevron } from "./disclosure-motion";
import Square from "lucide-react-native/icons/square";
import CheckSquare from "lucide-react-native/icons/square-check-big";
import { Sheet } from "./dialogs";
import { Body } from "./typography";
import { Button } from "./buttons";
import { SearchField } from "./search-field";
import { Empty } from "./feedback";
import { useLocale } from "@/i18n";
import { usePrivateContentAccess, type PrivateContentAccess } from "./private-access";
import { normalizeSearch } from "./search-matching";
import { useFilteredListScrollMemory } from "./use-list-scroll-memory";
import { useCopy } from "./copy";
import { colors, metrics, opacity, radii, semanticColors, space } from "./tokens";
import { uiStyles } from "./styles";
import { filterSelection, selectionLabels, toggleSelection, type SelectionOption } from "./selection-model";

type SelectionFieldOption<T extends string> = SelectionOption<T> & { icon?: ReactNode };

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
}: MultiSelectProps<T> & { multiple?: boolean }) {
  useMobileTheme();
  const copy = useCopy();
  const locale = useLocale(), access = usePrivateContentAccess();
  const trigger = useRef<View>(null);
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [opening, setOpening] = useState<{ access: PrivateContentAccess } | null>(null);
  const open = !!opening;
  const [search, setSearch] = useState("");
  const optionLabels = useMemo(
    () => new Map(options.map((option) => [option.value, option.label])),
    [options],
  );
  const labels = selectionLabels(values, optionLabels);
  const selectedIcon = values.length === 1
    ? options.find((option) => option.value === values[0])?.icon
    : undefined;
  const limit = Math.max(1, summaryLimit);
  const summary = labels.length
    ? `${labels.slice(0, limit).join(", ")}${labels.length > limit ? ` +${labels.length - limit}` : ""}`
    : (placeholder ?? copy("Seç…", "Select…"));
  const filtered = useMemo(() => filterSelection(options, search, locale), [options, search, locale]);
  const searchEnabled = (searchable ?? options.length > 6) || !!search;
  const available = !disabled && access.allowed && access.check() && (!opening || opening.access.allowed && opening.access.check());
  const searchKey = normalizeSearch(search, locale);
  const signature = JSON.stringify([searchKey, locale, values, options.map(option => [option.value, option.label, option.detail, option.disabled])]);
  const view = useMemo(() => ({}), [opening, available, signature, multiple, max]);
  const input = useMemo(() => ({}), [opening, available]);
  const live = useRef({ opening, view, input, available, access, values, onChange, filtered });
  live.current = { opening, view, input, available, access, values, onChange, filtered };
  const current = () => mounted.current && !!opening && live.current.opening === opening && live.current.available &&
    live.current.access.allowed && live.current.access.check() && opening.access.allowed && opening.access.check();
  const openPanel = () => {
    if (!mounted.current || live.current.opening || !live.current.available || !live.current.access.allowed || !live.current.access.check()) return;
    const next = { access: live.current.access }; live.current.opening = next; setSearch(""); setOpening(next);
  };
  const close = () => { if (mounted.current && opening && live.current.opening === opening) { live.current.opening = null; setOpening(null); } };
  useLayoutEffect(() => { if (opening && !available) close(); }, [opening, available]);
  const changeSearch = (value: string) => { if (current() && live.current.input === input) setSearch(value); };
  const clearSearch = () => { if (live.current.view === view) changeSearch(""); };
  const clearSelection = () => { if (current() && live.current.view === view) live.current.onChange([]); };
  const choose = (value: T) => {
    if (!current() || live.current.view !== view) return;
    const item = live.current.filtered.find(option => option.value === value);
    if (!item || item.disabled || multiple && !live.current.values.includes(value) && max !== undefined && live.current.values.length >= max) return;
    live.current.onChange(multiple ? toggleSelection(live.current.values, value, max) : [value]);
    if (!multiple) close();
  };
  const position = useFilteredListScrollMemory<SelectionFieldOption<T>>(searchKey, open && available, filtered.length, { suspended: !open || !available });
  const row = variant === "row";
  return (
    <View style={row ? undefined : uiStyles.field}>
      {!hideLabel && !row ? <Text style={uiStyles.fieldLabel}>{label}</Text> : null}
      {row ? (
        <Pressable
          ref={trigger}
          accessibilityRole="combobox"
          accessibilityLabel={`${label}: ${labels.length ? labels.join(", ") : summary}`}
          accessibilityHint={error ?? hint}
          accessibilityState={{ expanded: open && available, disabled: !available }}
          aria-expanded={open && available}
          aria-disabled={!available}
          disabled={!available}
          onPress={openPanel}
          style={({ pressed }) => ({
            minHeight: metrics.touchTarget,
            flexDirection: "row",
            alignItems: "center",
            gap: space.row,
            paddingHorizontal: 0,
            paddingVertical: space.sm,
            backgroundColor: pressed ? colors.raised : "transparent",
            opacity: !available ? opacity.disabled : 1,
          })}
        >
          {icon}
          <View style={[uiStyles.grow, { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.sm }]}>
            <Body selectable={false} style={[uiStyles.label, { flexGrow: 1, flexShrink: 1, flexBasis: 104 }]}>
              {label}
            </Body>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1, maxWidth: "100%" }}>
              <SelectionIcon>{selectedIcon}</SelectionIcon>
              <Body selectable={false} muted style={{ flexShrink: 1 }}>{summary}</Body>
            </View>
          </View>
          <ChevronsUpDown size={15} strokeWidth={2.2} color={colors.tertiary} />
        </Pressable>
      ) : (
      <Pressable
        ref={trigger}
        accessibilityRole="combobox"
        accessibilityLabel={`${label}: ${labels.length ? labels.join(", ") : summary}`}
        accessibilityHint={error ?? hint}
        accessibilityState={{ expanded: open && available, disabled: !available }}
        aria-expanded={open && available}
        aria-disabled={!available}
        disabled={!available}
        hitSlop={compact ? { top: 4, bottom: 4, left: 0, right: 0 } : undefined}
        onPress={openPanel}
        style={({ pressed }) => [
          uiStyles.input,
          compact && {
            minHeight: metrics.iconTarget,
            paddingVertical: 6,
            borderColor: colors.separator,
          },
          error && { borderColor: semanticColors.danger.border },
          open && { borderColor: colors.accent },
          {
            flexDirection: "row",
            alignItems: "center",
            gap: space.sm,
            opacity: !available ? opacity.disabled : pressed ? opacity.pressed : 1,
          },
        ]}
      >
        <SelectionIcon>{selectedIcon}</SelectionIcon>
        <Body selectable={false} muted={!labels.length} style={uiStyles.grow}>
          {summary}
        </Body>
        <DisclosureChevron
          expanded={open}
          size={16}
          color={colors.muted}
          closedAngle={90}
          openAngle={270}
        />
      </Pressable>
      )}
      {error ? (
        <Text selectable accessibilityRole="alert" style={uiStyles.error}>
          {error}
        </Text>
      ) : hint ? (
        <Text selectable style={uiStyles.caption}>
          {hint}
        </Text>
      ) : null}
      <Sheet
        visible={open && available}
        onClose={close}
        title={label}
        size={searchEnabled ? "full" : "compact"}
        scroll={false}
        returnFocusRef={trigger}
        headerAction={
          multiple ? (
            <Button label={copy("Tamam", "Done")} tone="quiet" onPress={close} />
          ) : undefined
        }
      >
        <View style={{ flexShrink: 1, flexGrow: searchEnabled ? 1 : 0, minHeight: 0 }}>
          {searchEnabled || multiple ? (
            <View style={[uiStyles.header, { paddingHorizontal: space.screen, flexShrink: 0 }]}>
              {searchEnabled ? <SearchField
                label={copy("Seçenek ara", "Search options")}
                value={search} onChangeText={changeSearch} /> : null}
              {multiple ? (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: space.row,
                    minHeight: 34,
                  }}
                >
                  <Body muted style={[uiStyles.grow, uiStyles.caption]}>
                    {max !== undefined
                      ? copy("{p0}/{p1} seçildi", "{p0}/{p1} selected", {
                          p0: values.length,
                          p1: max,
                        })
                      : copy("{p0} seçildi", "{p0} selected", { p0: values.length })}
                  </Body>
                  {values.length ? (
                    <Button
                      density="compact"
                      disabled={!available}
                      label={copy("Seçimi temizle", "Clear selection")}
                      onPress={clearSelection}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
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
            contentContainerStyle={{ paddingHorizontal: space.screen, paddingBottom: space.lg }}
            ItemSeparatorComponent={() => (
              <View style={[uiStyles.separator, { marginHorizontal: space.sm }]} />
            )}
            ListEmptyComponent={<Empty compact
              title={options.length ? copy("Eşleşen seçenek yok.", "No matching options.") : copy("Kullanılabilir seçenek yok.", "No options available.")}
              action={searchKey ? { label: copy("Aramayı temizle", "Clear search"), onPress: clearSearch } : undefined} />}
            renderItem={({ item }) => {
              const selected = values.includes(item.value);
              const off =
                !available ||
                !!item.disabled ||
                (!!multiple && !selected && max !== undefined && values.length >= max);
              return (
                <Pressable
                  accessibilityRole={multiple ? "checkbox" : "radio"}
                  accessibilityLabel={[item.label, item.detail].filter(Boolean).join(". ")}
                  accessibilityState={{ checked: selected, disabled: off }}
                  aria-checked={selected}
                  aria-disabled={off}
                  disabled={off}
                  onPress={() => choose(item.value)}
                  style={({ pressed }) => ({
                    minHeight: metrics.selectionHeight,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.md,
                    paddingHorizontal: space.md,
                    paddingVertical: space.sm,
                    borderRadius: radii.control,
                    backgroundColor: pressed ? colors.raised : "transparent",
                    opacity: off ? opacity.disabled : 1,
                  })}
                >
                  <SelectionIcon>{item.icon}</SelectionIcon>
                  <View style={[uiStyles.grow, { gap: 2 }]}>
                    <Body
                      style={selected ? { color: colors.accent, fontWeight: "600" } : undefined}
                    >
                      {item.label}
                    </Body>
                    {item.detail ? (
                      <Body muted style={uiStyles.caption}>
                        {item.detail}
                      </Body>
                    ) : null}
                  </View>
                  {multiple ? (
                    selected ? (
                      <CheckSquare color={colors.accent} size={20} />
                    ) : (
                      <Square color={colors.muted} size={20} />
                    )
                  ) : selected ? (
                    <Check color={colors.accent} strokeWidth={2.6} size={20} />
                  ) : null}
                </Pressable>
              );
            }}
          />
        </View>
      </Sheet>
    </View>
  );
}

function SelectionIcon({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ flexShrink: 0, alignItems: "center", justifyContent: "center" }}>{children}</View>;
}
