import { useMobileTheme } from "./theme";
import { useMemo, useRef, useState, type ReactNode } from "react";
import ChevronsUpDown from "lucide-react-native/icons/chevrons-up-down";
import { FlatList, Text, View } from "react-native";
import { Pressable } from "react-native";
import Check from "lucide-react-native/icons/check";
import { DisclosureChevron } from "./disclosure-motion";
import Search from "lucide-react-native/icons/search";
import Square from "lucide-react-native/icons/square";
import CheckSquare from "lucide-react-native/icons/square-check-big";
import { Sheet } from "./dialogs";
import { Body } from "./typography";
import { Button } from "./buttons";
import { Input } from "./fields";
import { useCopy } from "./copy";
import { colors, metrics, opacity, radii, semanticColors, space } from "./tokens";
import { uiStyles } from "./styles";
import { filterSelection, toggleSelection, type SelectionOption } from "./selection-model";

type CommonProps<T extends string> = {
  label: string;
  options: readonly SelectionOption<T>[];
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
  const trigger = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const optionLabels = useMemo(
    () => new Map(options.map((option) => [option.value, option.label])),
    [options],
  );
  const labels = values.map((value) => optionLabels.get(value) ?? value);
  const limit = Math.max(1, summaryLimit);
  const summary = labels.length
    ? `${labels.slice(0, limit).join(", ")}${labels.length > limit ? ` +${labels.length - limit}` : ""}`
    : (placeholder ?? copy("Seç…", "Select…"));
  const filtered = useMemo(() => filterSelection(options, search), [options, search]);
  const searchEnabled = searchable ?? options.length > 6;
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
          accessibilityState={{ expanded: open, disabled: !!disabled }}
          aria-expanded={open}
          aria-disabled={!!disabled}
          disabled={disabled}
          onPress={() => {
            setSearch("");
            setOpen(true);
          }}
          style={({ pressed }) => ({
            minHeight: 52,
            flexDirection: "row",
            alignItems: "center",
            gap: space.row,
            paddingHorizontal: space.lg,
            paddingVertical: space.sm,
            backgroundColor: pressed ? colors.raised : "transparent",
            opacity: disabled ? opacity.disabled : 1,
          })}
        >
          {icon}
          <Body numberOfLines={1} style={[uiStyles.label, uiStyles.grow]}>
            {label}
          </Body>
          <Body numberOfLines={1} muted style={{ flexShrink: 1, maxWidth: "55%" }}>
            {summary}
          </Body>
          <ChevronsUpDown size={15} strokeWidth={2.2} color={colors.tertiary} />
        </Pressable>
      ) : (
      <Pressable
        ref={trigger}
        accessibilityRole="combobox"
        accessibilityLabel={`${label}: ${labels.length ? labels.join(", ") : summary}`}
        accessibilityHint={error ?? hint}
        accessibilityState={{ expanded: open, disabled: !!disabled }}
        aria-expanded={open}
        aria-disabled={!!disabled}
        disabled={disabled}
        hitSlop={compact ? { top: 4, bottom: 4, left: 0, right: 0 } : undefined}
        onPress={() => {
          setSearch("");
          setOpen(true);
        }}
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
            opacity: disabled ? opacity.disabled : pressed ? opacity.pressed : 1,
          },
        ]}
      >
        <Body numberOfLines={1} muted={!labels.length} style={uiStyles.grow}>
          {summary}
        </Body>
        {multiple && values.length ? (
          <Text
            style={[
              uiStyles.badge,
              {
                color: colors.accent,
                backgroundColor: colors.selected,
                borderColor: semanticColors.info.border,
              },
            ]}
          >
            {values.length}
          </Text>
        ) : null}
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
        visible={open}
        onClose={() => setOpen(false)}
        title={label}
        size={searchEnabled ? "form" : "compact"}
        scroll={false}
        returnFocusRef={trigger}
        headerAction={
          multiple ? (
            <Button label={copy("Tamam", "Done")} tone="quiet" onPress={() => setOpen(false)} />
          ) : undefined
        }
      >
        <View style={{ flexShrink: 1, flexGrow: searchEnabled ? 1 : 0 }}>
          {searchEnabled || multiple ? (
            <View style={uiStyles.header}>
              {searchEnabled ? (
                <View
                  style={[
                    uiStyles.input,
                    {
                      flexDirection: "row",
                      alignItems: "center",
                      gap: space.sm,
                      paddingVertical: 0,
                    },
                  ]}
                >
                  <Search color={colors.muted} size={18} />
                  <Input
                    label={copy("Seçenek ara", "Search options")}
                    placeholder={copy("Seçenek ara", "Search options")}
                    value={search}
                    onChangeText={setSearch}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    clearButtonMode="while-editing"
                    style={[
                      uiStyles.grow,
                      { borderWidth: 0, backgroundColor: "transparent", paddingHorizontal: 0 },
                    ]}
                  />
                </View>
              ) : null}
              {multiple ? (
                <View
                  style={{
                    flexDirection: "row",
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
                      disabled={disabled}
                      label={copy("Seçimi temizle", "Clear selection")}
                      onPress={() => onChange([])}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
          <FlatList
            data={filtered}
            extraData={values}
            style={{ flexGrow: searchEnabled ? 1 : 0, flexShrink: 1 }}
            keyExtractor={(option) => option.value}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ paddingHorizontal: space.screen, paddingBottom: space.lg }}
            ItemSeparatorComponent={() => (
              <View style={[uiStyles.separator, { marginHorizontal: space.sm }]} />
            )}
            ListEmptyComponent={
              <Body muted>
                {options.length
                  ? copy("Eşleşen seçenek yok.", "No matching options.")
                  : copy("Kullanılabilir seçenek yok.", "No options available.")}
              </Body>
            }
            renderItem={({ item }) => {
              const selected = values.includes(item.value);
              const off =
                !!disabled ||
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
                  onPress={() => {
                    onChange(multiple ? toggleSelection(values, item.value, max) : [item.value]);
                    if (!multiple) setOpen(false);
                  }}
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
                  <View style={[uiStyles.grow, { gap: 2 }]}>
                    <Body
                      style={selected ? { color: colors.accent, fontWeight: "600" } : undefined}
                    >
                      {item.label}
                    </Body>
                    {item.detail ? (
                      <Body muted numberOfLines={2} style={uiStyles.caption}>
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
