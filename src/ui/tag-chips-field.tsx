import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import X from "lucide-react-native/icons/x";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";
import { fontSize, lineHeight, metrics, radii, space } from "./tokens";
import { FieldError } from "./feedback";

// Colors come from useMobileTheme() at render so a theme switch restyles mounted chips.
const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.sm, rowGap: space.xs },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
    minHeight: metrics.chipHeight,
    paddingHorizontal: space.row,
    borderRadius: radii.pill,
  },
  chipText: { fontSize: fontSize.small, lineHeight: lineHeight.small, fontWeight: "500" },
  input: {
    flexGrow: 1,
    minWidth: 120,
    minHeight: metrics.inputHeight,
    // The same entry type as every other field (16/21).
    fontSize: fontSize.input,
    lineHeight: lineHeight.input,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
});

// The chip stays 28 tall; its press target reaches 48 into the row gap.
const CHIP_SLOP = { top: (metrics.touchTarget - metrics.chipHeight) / 2, bottom: (metrics.touchTarget - metrics.chipHeight) / 2, left: space.xxs, right: space.xxs };

/**
 * Tags as `#tag` chips. Editable chips carry a remove mark and are followed by
 * an inline entry: Return, a comma or leaving the field adds what was typed.
 * `normalize` owns the stored form (case, separators, duplicates).
 */
export function TagChipsField({
  label,
  tags,
  onChange,
  normalize = (next) => [...new Set(next.map((tag) => tag.trim()).filter(Boolean))],
  placeholder,
  editable = true,
  error,
}: {
  label: string;
  tags: readonly string[];
  onChange?: (tags: string[]) => void;
  normalize?: (tags: readonly string[]) => string[];
  placeholder?: string;
  editable?: boolean;
  error?: string;
}) {
  const { colors: palette, mode } = useMobileTheme();
  const copy = useCopy();
  const [draft, setDraft] = useState("");
  const editing = editable && !!onChange;
  const commit = (text: string) => {
    const parts = text.split(/[,\n]/).map((part) => part.trim()).filter(Boolean);
    if (parts.length && onChange) onChange(normalize([...tags, ...parts]));
  };
  if (!editing && !tags.length) return null;
  const chips = (
    <View accessibilityLabel={label} style={styles.row}>
      {tags.map((tag) =>
        editing ? (
          <Pressable
            key={tag}
            accessibilityRole="button"
            accessibilityLabel={copy("#{p0} etiketini kaldır", "Remove #{p0}", { p0: tag })}
            hitSlop={CHIP_SLOP}
            onPress={() => onChange?.(tags.filter((current) => current !== tag))}
            style={({ pressed }) => [styles.chip, { backgroundColor: palette.fill }, pressed && { opacity: 0.6 }]}
          >
            <Text style={[styles.chipText, { color: palette.muted }]}>#{tag}</Text>
            <X size={12} strokeWidth={2.4} color={palette.subtle} />
          </Pressable>
        ) : (
          <View key={tag} style={[styles.chip, { backgroundColor: palette.fill }]}>
            <Text style={[styles.chipText, { color: palette.muted }]}>#{tag}</Text>
          </View>
        ),
      )}
      {editing ? (
        <TextInput
          value={draft}
          onChangeText={(next) => {
            // A typed or pasted separator finishes every tag before it.
            const end = Math.max(next.lastIndexOf(","), next.lastIndexOf("\n"));
            if (end === -1) return setDraft(next);
            commit(next.slice(0, end));
            setDraft(next.slice(end + 1));
          }}
          onSubmitEditing={() => {
            commit(draft);
            setDraft("");
          }}
          onBlur={() => {
            commit(draft);
            setDraft("");
          }}
          submitBehavior="submit"
          returnKeyType="done"
          accessibilityLabel={label}
          aria-invalid={!!error || undefined}
          placeholder={placeholder ?? copy("Etiket ekle", "Add tag")}
          placeholderTextColor={palette.muted}
          selectionColor={palette.accent}
          cursorColor={palette.accent}
          keyboardAppearance={mode === "dark" ? "dark" : "light"}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: palette.text }]}
        />
      ) : null}
    </View>
  );
  // A visible message like every Field, not only `aria-invalid`.
  return error ? <View style={{ gap: space.xs }}>{chips}<FieldError message={error} /></View> : chips;
}
